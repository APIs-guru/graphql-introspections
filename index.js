'use strict';

const fs = require('fs');
const URL = require('url');
const path = require('path');

const fetch = require('node-fetch');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const _ = require('lodash');

const introspectionQuery = require('graphql/utilities').introspectionQuery;

const jsondiffpatch = require('jsondiffpatch');

function reflect(promise){
  return promise.then((v) => ({v:v, status: "resolved" }),
                      (e) => ({e:e, status: "rejected" }));
}


function getMostRecentFileName(dir) {
  var files = fs.readdirSync(dir);

  // use underscore for max()
  let res=  _.max(files, function (f) {
    var fullpath = path.join(dir, f);

    // ctime = creation time is used
    // replace with mtime for modification time
    return fs.statSync(fullpath).ctime;
  });
  return res;
}

class GraphQLDumper {

  static dump(config, filename) {
    let pathName = path.dirname(filename);
    mkdirp.sync(pathName);

    return fetch(config.url, {
      method: 'POST',
      body: JSON.stringify({
        query: introspectionQuery
      }),
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
        },
        config.headers || {}
      ),
    })
    .then(res => {
      if (!res.ok) {
        return res.text().then(text => {
          throw new Error(`${res.statusText}: ${text}`);
        });
      }
      return res.json()
    })
    .then(body => {
      if (body.errors) throw new Error(JSON.stringify(body.errors));

      let lastFile = getMostRecentFileName(pathName);
      let prevData;
      if (lastFile) {
        let prevFile = path.join(pathName, lastFile);
        prevData = JSON.parse(fs.readFileSync(prevFile));
      } else {
        prevData = null;
      }

      let response = body.data;

      let delta = jsondiffpatch.diff(prevData, response);
      if (!delta || !_.keys(delta).length) {
        console.warn(`SKIP ${config.url} no changes`);
        return;
      }

      return new Promise((resolve, reject) => {
        fs.writeFile(filename, JSON.stringify(response, null, '  '), (err) => {
          if (err) return rejectAndLog(err);
          console.log(`OK   ${config.url} dumped to ${filename}`);
          resolve();
        });
      });
    })
    .catch(err => {
      console.error(`FAIL ${config.url} - ${err.message}`);
      throw err;
    })
  }

  static replaceFileNameTmpl(template, url) {
    let hostname = URL.parse(url).hostname;
    let res = template.replace('{{host}}', encodeURIComponent(hostname));
    res = res.replace('{{date}}', dateFormat(new Date(), 'mm-dd-yyyy'));

    return res;
  }

  static dumpAll(servers, filenameTmpl) {
    let dumpPromises = servers.map(config =>
      this.dump(config, this.replaceFileNameTmpl(filenameTmpl, config.url)));
    return Promise.all(dumpPromises.map(reflect));
  }
}

module.exports = {
  GraphQLDumper: GraphQLDumper
}
