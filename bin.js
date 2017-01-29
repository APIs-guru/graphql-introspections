#!/usr/local/bin/node

const path = require('path');
const fs = require('fs');
const url = require('url');
const fetch = require('node-fetch');
const _ = require('lodash');

const argv = require('yargs')
  .usage('Usage: $0 -t [filename template] -o [outputdir] [URL to json with servers]')
  .demand(['o'])
  .describe('o', 'Output folder')
  .describe('t', 'Template for output filename. `{{host}}` and `{{date}}` can be used')
  .default('t', '{{host}}/{{date}}.json')
  .help('h')
  .argv;

const GraphQLDumper = require('./index').GraphQLDumper;
const authHeaders = require('./auth-headers');

const outputTemplate = path.join(argv.o, argv.t);
const input = argv._[0] || 'https://apis.guru/graphql-apis/apis.json';


console.log(new Date());
console.log('--------------------------');

fetch(input)
  .then(res => res.json())
  .then(serversInfo => {
    let mergedInfo = _.map(serversInfo, serverConf => {
      return _.defaultsDeep(
        {},
        serverConf,
        authHeaders[serverConf.url] || {}
      );
    });
    return GraphQLDumper.dumpAll(mergedInfo, outputTemplate)
      .then(() => console.log('Done\n-------------------------\n'))
  })
  .catch(err => {
    console.log(err);
  })
