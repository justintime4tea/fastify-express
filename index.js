// Keycloak is only enabled if it is passed to createFakeFastify but this
// is here in-case you want to quickly disable authZ/authO
const DISABLE_KEYCLOAK = process.env['DISABLE_KEYCLOAK'];
const DEBUG =
  process.env['DEBUG'] &&
  (process.env['DEBUG'] === '*' ||
    process.env['DEBUG'].includes('fastify-express'));

const TAG = '[fastify-express]';
const log = (...stuff) => {
  if (DEBUG) {
    console.log(`${TAG} `, ...stuff);
  }
};

const isAsyncFunction = func => {
  if (!func) {
    return false;
  }
  return func[Symbol.toStringTag] === 'AsyncFunction';
};

const isFunction = func => {
  if (!func) {
    return false;
  }
  return (
    typeof func === 'function' ||
    `${func.constructor}`.startsWith('function Function') ||
    `${func.constructor}`.startsWith('function AsyncFunction') ||
    isAsyncFunction(func)
  );
};

const buildModernRouteDef = (method, url, options, handler) => {
  if (isFunction(options)) {
    return {method, url, handler: options};
  } else {
    return Object.assign(options, {method, url, handler});
  }
};

/**
 * Take an express instance and create an interface which can mimic fastify
 * enough so that you can use this interface instead of fastify in a project
 * which already uses fastify.
 *
 * @param {object} expressInstance An instance of express,
 *    ie: const express = require('express')()
 * @param {object} [keycloak] An instance of Keycloak which is
 * already configured for your Keycloak server/service.
 * @returns {object} An object which should be interchangeable
 * with a real fastify instance.
 */
function createFakeFastify(expressInstance, keycloak) {
  const deferredRoutes = [];
  const fastifyPlugins = [];
  const fastifyHooks = [];
  const fastifyContext = {};
  const fastifyReplyDecorators = {};
  const fastifyInterface = {
    decorate: function(name, decoration) {
      if (fastifyContext.hasOwnProperty(name)) {
        log(`Attempted to overwrite a decoration named ${name}`);
      } else {
        // eslint-disable-next-line
        fastifyContext[name] = decoration
      }
      return this;
    },
    addHook: function(eventName, callback) {
      // TODO: Support hooks
      fastifyHooks.push({event: eventName, callback});
      return this;
    },
    decorateReply: function(name, decoration) {
      if (fastifyReplyDecorators.hasOwnProperty(name)) {
        log(`Attempted to overwrite a reply decoration named ${name}`);
      } else {
        // eslint-disable-next-line
        fastifyReplyDecorators[name] = decoration
      }
      return this;
    }
  };

  Object.assign(fastifyContext, fastifyInterface);
  const fakeFastify = {
    register: (plugin, options) => {
      fastifyPlugins.push({
        load: async () => {
          return new Promise(async (resolve, reject) => {
            try {
              if (isAsyncFunction(plugin)) {
                let resolved = false;
                await plugin(fastifyContext, options, err => {
                  if (err) {
                    reject(err);
                  }
                  if (!resolved) {
                    resolved = true;
                    resolve();
                  }
                  resolve();
                });
                if (!resolved) {
                  resolved = true;
                  return resolve();
                }
              }
              plugin(fastifyContext, options, err => {
                if (err) {
                  return reject(err);
                }
                return resolve(err);
              });
            } catch (err) {
              reject(err);
            }
          });
        }
      });
    },
    addContentTypeParser: (contentType, callback) => {
      // TODO: support this
    },
    get: (url, options, handler) => {
      deferredRoutes.push(buildModernRouteDef('GET', url, options, handler));
    },
    post: (url, options, handler) => {
      deferredRoutes.push(buildModernRouteDef('POST', url, options, handler));
    },
    put: (url, options, handler) => {
      deferredRoutes.push(buildModernRouteDef('PUT', url, options, handler));
    },
    patch: (url, options, handler) => {
      deferredRoutes.push(buildModernRouteDef('PATCH', url, options, handler));
    },
    delete: (url, options, handler) => {
      deferredRoutes.push(buildModernRouteDef('DELETE', url, options, handler));
    },
    listen: async function(...args) {
      log('Registering fastify plugins');
      for (const plugin of fastifyPlugins) {
        try {
          await plugin.load();
        } catch (err) {
          log('Error loading plugin');
          console.error(err);
        }
      }
      log(
        'Loading routes registered by plugins using method call ' +
          '[ie: fastify.get("/", opts, func)]'
      );
      for (const route of deferredRoutes) {
        fakeFastify.route(route);
      }
      log(`Attempting to listen using args: ${args}`);
      // TODO: Start express listening
      expressInstance.listen(...args);
      return Promise.resolve();
    },
    route: async ({method, url, beforeHandler, handler, schema}) => {
      if (!isFunction(handler)) {
        log(`Route ${method} : ${url} was missing a valid handler.`);
      } else {
        log(`Registering route - ${method} : ${url}`);
        let keycloakEnforcer;
        if (keycloak && !DISABLE_KEYCLOAK) {
          const urlParts = url.split('/');

          let resource = urlParts[1];
          if (resource) {
            // TODO: Replace this version check with something more appropriate.
            // No resources/routes that start.with v will work...
            if (resource.includes('v')) {
              resource = urlParts[2];
            }

            // Capitalizes the resource name
            resource =
              resource[0].toUpperCase() + resource.substring(1, resource.length);
          }

          let permission;
          switch (method) {
            case 'GET': {
              permission = 'view';
              break;
            }
            case 'POST': {
              permission = 'create';
              break;
            }
            case 'PUT': {
              permission = 'update';
              break;
            }
            case 'DELETE': {
              permission = 'delete';
              break;
            }
            default: {
              permission = '';
            }
          }

          if (!!resource && !!permission) {
            log(
              'Creating keycloak enforcer for route:',
              `${resource} with ${permission} permission.`
            );
            keycloakEnforcer = keycloak.enforcer(`${resource}:${permission}`);
          }
        }

        const methodLowerCase = method.toLowerCase();
        if (expressInstance.hasOwnProperty(methodLowerCase)) {
          const handlers = [];
          // eslint-disable-next-line
          const routeMethod = expressInstance[methodLowerCase]

          if (isFunction(beforeHandler)) {
            const wrappedHandler = wrapFastifyHandler(
              fastifyReplyDecorators,
              beforeHandler
            );

            handlers.push(wrappedHandler);
          }

          // Keycloak works with express so we need not do any magic wrapping.
          if (isFunction(keycloakEnforcer)) {
            handlers.push(keycloakEnforcer);
          }

          handlers.push(wrapFastifyHandler(fastifyReplyDecorators, handler, schema));
          routeMethod.call(expressInstance, url, ...handlers);
        }
      }
    }
  };
  // TODO: Make this better...
  Object.assign(fastifyContext, fakeFastify);
  Object.assign(fakeFastify, fastifyContext);
  return fakeFastify;
}

/**
 * Wraps a fastify handler with an express handler.
 *
 * @param {object} replyDecorators Things that should decorate the reply object.
 * @param {Function} handler The fastify handler to wrap.
 * @param {object} [schema] A fastify schema definition.
 * @returns {Function} A request handling function.
 */
function wrapFastifyHandler(replyDecorators, handler, schema) {
  return async (req, res, next) => {
    const reply = {};
    const request = {};

    const send = response => {
      res.send(response);
    };
    const code = statusCode => {
      res.status(statusCode);
      return reply;
    };
    const header = function(...args) {
      res.header.call(res, ...args)
      return reply
    };
    Object.assign(reply, {
      code,
      send,
      header,
      getHeader: header,
      setHeader: header
    }, replyDecorators);
    Object.assign(request, {
      headers: req.headers,
      query: req.query,
      params: req.params,
      body: req.body,
      raw: req
    });

    // Check schema requirements
    if (!!req.body && !!schema.body && !!schema.body.required && Array.isArray(schema.body.required)) {
      const requiredFields = schema.body.required;
      const requestBody = req.body;

      for (const requiredFieldName of requiredFields) {
        if (typeof requiredFieldName === 'string' && requiredFields.hasOwnProperty(requiredFieldName) && !requestBody.hasOwnProperty(requiredFieldName)) {
          return reply.code(400).send({
            status: 400,
            message: `Request body must contain ${requiredFieldName}.`
          });
        }
      }
    }

    // TODO: When schema body present strip the fields not listed in schema body (req)
    // TODO: When response schema body present only return listed fields (res/reply)

    if (isAsyncFunction(handler)) {
      try {
        await handler(request, reply);
      } catch (err) {
        return next(err);
      }
      return next();
    }
    return handler(request, reply, next);
  };
}

module.exports = {createFakeFastify};
