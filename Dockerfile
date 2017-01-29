# DOCKER-VERSION        1.3.2

FROM node:latest

MAINTAINER Matt Henkes

RUN mkdir /terra_hubot

Add . /terra_hubot

WORKDIR /terra_hubot

RUN npm install

ENV HUBOT_PORT 80
ENV HUBOT_ADAPTER slack
ENV HUBOT_NAME immortan_joe
ENV HUBOT_SLACK_BOTNAME ${HUBOT_NAME}
ENV EXPRESS_PORT ${HUBOT_PORT}

EXPOSE ${HUBOT_PORT}

CMD bin/hubot
