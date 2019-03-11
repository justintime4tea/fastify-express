# Fastify Express!

## Introduction
The goal of this project is *simple*. Provide the means to take an existing project which is using Fastify and enable it to use express with minimal to no code changes in the rest of the project. This is a very rudimentary and novel effort. This definitely needs more work but hey there are no dependencies! So that's neat.

This project was started because I wanted to use Keycloak in Fastify projects. Keycloak has [keycloak-connect]([https://link](https://github.com/keycloak/keycloak-nodejs-connect)) which gives your Node project the ability to use Keycloak for authentication and authorization. It labels itself as 'connect-friendly' *however*... it is actuality 'express-friendly' and expected to be used with express or an express like library. Instead of making my own Keycloak policy enforcer/library for Fastify (or making an express->fastify translater/wrapper-ma-doodle) I built this.

I have several projects which use Fastify I needed a way to leverage the keycloak-connect library within my projects. This project was born from that need. It probably won't work for every Fastify project (or many?) because I've only faked what I needed for my projects to run. Pull requests are welcome!

If you include 'fastify-express' in the environment variable DEBUG (or wildcard debug) then you will get simple console.log statements for debugging, yay.

## What works and what doesn't?
Time is limited and I've just ran out. I will return to update this some day. Maybe.