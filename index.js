const express = require('express');
// const bodyParser = require('body-parser');
const coroute = require('co-express');
const coroutine = require('bluebird').coroutine;
const request = require('request-promise');
const _ = require('lodash');

const app = express();
const owners = process.env.OWNERS.split(',');

const github = coroutine(function* (req) {
  req = _.merge({
    json: true,
    headers: {
      'User-Agent': 'Zotero Better BibTeX',
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  }, req)
  req.uri = `https://api.github.com/repos/${req.uri}`

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
  response.render('pages/index');
});

app.post('/comment', githubMiddleware, coroute(function* (req, res, next) {
  if (req.headers['x-github-event'] == 'ping') return res.status(200).send({ success: true });
  if (req.headers['x-github-event'] != 'issue_comment') throw new Error(`Did not expect ${req.headers['x-github-event']}`);

  var payload = req.body;

  // var labels = yield github({ uri: `/issues/${payload.issue.number}/labels` });
  // labels = labels.map(label => label.name);

  const awaiting = 'awaiting feedback from user'

	if (owners.includes(payload.sender.login)) {
    if (!payload.issue.labels.includes(awaiting)) {
      yield github({
        uri: `${payload.repository.full_name}/issues/${payload.issue.number}/labels`,
        method: 'POST',
        body: [ awaiting ],
      })
    }
  } else {
    if (payload.issue.labels.includes(awaiting)) {
      yield github({
        uri: `${payload.repository.full_name}/issues/${payload.issue.number}/labels/${encodeURIComponent(awaiting)}`,
        method: 'DELETE',
      })
    }
  }

	res.status(200).send({ success: true })
}));

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});