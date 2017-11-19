const express = require('express');
// const bodyParser = require('body-parser');
const coroute = require('co-express');
const coroutine = require('bluebird').coroutine;
const request = require('request-promise');
const _ = require('lodash');

const app = express();
const owners = new Set(process.env.OWNERS.split(','));
const ignoreUsers = new Set(process.env.IGNORE_USERS.split(','));
const ignoreLabels = new Set(process.env.IGNORE_LABELS.split(','));

const activityLog = [];

const github = coroutine(function* (req) {
  req = _.merge({
    json: true,
    headers: {
      'User-Agent': 'Zotero Better BibTeX',
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  }, req)
  req.uri = `https://api.github.com/repos/${req.uri}`

  activityLog.push({ timestamp: new Date, method: req.method, body: req.body, uri: req.uri });
  activityLog.splice(20, activityLog.length)

  return yield request(req)
})

const githubMiddleware = require('github-webhook-middleware')({
  secret: process.env.SECRET,
  limit: '1mb', // <-- optionally include the webhook json payload size limit, useful if you have large merge commits. Default is '100kb'
})
// app.use(bodyParser.json())
// app.use(bodyParser.text())

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
  response.render('pages/index', { activityLog });
});

app.post('*', function reroute(req, res, next) {
  if (req.url == '/' && req.headers['x-github-event']) {
    req.url += `/${req.headers['x-github-event']}`;
  }
  next('route');
});

const update_labels = coroutine(function* (action, payload) {
  if (payload.issue.labels.find(label => ignoreLabels.has(label.name))) action = 'remove'
  switch (action) {
    case 'add':
      if (!payload.issue.labels.find(label => label.name == awaiting)) { // 'awaiting' label not present
        yield github({
          uri: `${payload.repository.full_name}/issues/${payload.issue.number}/labels`,
          method: 'POST',
          body: [ awaiting ],
        })
      }
      break;

    case 'remove':
      if (payload.issue.labels.find(label => label.name == awaiting)) { // label is present
        yield github({
          uri: `${payload.repository.full_name}/issues/${payload.issue.number}/labels/${encodeURIComponent(awaiting)}`,
          method: 'DELETE',
        })
      }
      break;
  }
})

app.post('/ping', githubMiddleware, function (req, res, next) {
  return res.status(200).send({ success: true });
});

app.post('/issues', githubMiddleware, coroute(function* (req, res, next) {
  switch (req.body.action) {
    case 'closed':
      yield update_labels('remove', req.body);
      break;
    case 'reopened':
      yield update_labels('add', req.body);
      break;
    }
  }
  return res.status(200).send({ success: true })
}));

app.post('/issue_comment', githubMiddleware, coroute(function* (req, res, next) {
  if (ignoreUsers.has(req.body.sender.login)) return res.status(200).send({ success: true });

  yield update_labels(payload.issue.state == 'open' && owners.has(payload.sender.login) ? 'add' : 'remove', req.body);
  return res.status(200).send({ success: true })
}));

app.post('/gollum', githubMiddleware, coroute(function* (req, res, next) {
  // get current gh-pages with ref=gh-pages https://developer.github.com/v3/repos/contents/#get-contents

  for (const page of req.body.pages) {
    // https://developer.github.com/v3/activity/events/types/#gollumevent


  }
  return res.status(200).send({ success: true })
}));


app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
