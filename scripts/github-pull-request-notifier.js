// # Description:
// #   An HTTP Listener that notifies about new Github pull requests
// #
// # Dependencies:
// #   "url": ""
// #   "querystring": ""
// #
// # Configuration:
// #   You will have to do the following:
//     Enviroment variables to setup:
//     HUBOT_GITHUB_API_TOKEN
//     HUBOT_GITHUB_HOST // future
//     HUBOT_GITHUB_PATH_PREFIX // future
// #   Add <HUBOT_URL>:<PORT>/hubot/gh-pull-requests?room=<room>[&type=<type>] url hook via API:
// #
// # Commands:
// #   None
// #
// # URLS:
// #   POST /hubot/gh-pull-requests?room=<room>[&type=<type]
// #
// # Authors:
// #   mjhenkes
// #
// # Notes:
// #   Room information can be obtained by hubot-script: room-info.coffee
// #   Room must be in url encoded format (i.e. encodeURIComponent("yourRoomInfo"))

var announcePullRequest, querystring, url;

url = require('url');

querystring = require('querystring');

module.exports = function(robot) {

  robot.router.post("/hubot/gh-pull-requests", function(req, res) {
    var query = querystring.parse(url.parse(req.url).query);
    var room = query.room;
    var type = req.headers["x-github-event"];
    var delay=0;

    if (type == 'pull_request') {
      delay=15000; // Delay for 15 seconds to give status services a chance to set statuses to pending.
    }

    if (!validateHook(type, req.body)) {
      return res.end("");
    }

    try {
      setTimeout(function() {
        gatherStatusParameters(type, req.body, function(owner, repo, ref, date, id) {
          getPRStatus(owner, repo, ref, date, id, function(status){
            if(status == 'success' || status == 'failure' || status == 'error' || status == 'none') {
              gatherPullRequestParameters(type, req.body, function(title, user, link, body) {
                announcePullRequest(title, user, link, body, status, function(what) {
                  return robot.messageRoom(room, what);
                });
              });
            }
          });
        });
      }, delay);
    } catch (_error) {
      error = _error;
      robot.messageRoom(room, "Whoa, I got an error: " + error);
      console.log("github pull request notifier error: " + error + ". Request: " + req.body);
      console.log("failure");
    }
    return res.end("");
  });
};

validateHook = function (type, hook_data) {
  if (type == 'pull_request') {
    return (hook_data.action == 'opened' || hook_data.action == 'synchronize');
  }

  return (type == 'status');
}

gatherStatusParameters = function (type, hook_data, callback) {
  if (type == 'pull_request') {
    return callback(hook_data.repository.owner.login, hook_data.repository.name, hook_data.pull_request.head.sha, null, null)
  }
  else if (type == 'status') {
    return callback(hook_data.repository.owner.login, hook_data.repository.name, hook_data.sha, new Date(hook_data.updated_at), hook_data.id)
  }
};

gatherPullRequestParameters = function (type, hook_data, callback) {
  if (type == 'pull_request') {
    return callback(hook_data.pull_request.title, hook_data.pull_request.user.login, hook_data.pull_request.html_url, hook_data.pull_request.body)
  }
  else if (type == 'status') {
    var github = setupGithubApi();

    github.pullRequests.getAll({
      owner: hook_data.repository.owner.login,
      repo: hook_data.repository.name,
      state: 'open'
    }, function(err, pull_requests) {
      for (var i = pull_requests.length - 1; i >= 0; i--) {
        if (pull_requests[i].head.sha == hook_data.sha) {
          return callback(pull_requests[i].title, pull_requests[i].user.login, pull_requests[i].html_url, pull_requests[i].body)
        }
      }
    });
  }
};

announcePullRequest = function(title, user, link, body, status, cb) {
  var mentioned_line = buildMentionLine(body);
  var status = buildStatusLine(status);
  return cb("@here New pull request \"" + title + "\" by " + user + ": " + link + mentioned_line + status);
};

setupGithubApi = function() {
  var GitHubApi = require("github");

  var github = new GitHubApi({
      // debug: true,
      protocol: "https",
      // host: "github.cerner.com", // should be api.github.com for GitHub
      // pathPrefix: "/api/v3", // for some GHEs; none for GitHub
      timeout: 5000
  });

  github.authenticate({
    type: "oauth",
    token: process.env.HUBOT_GITHUB_API_TOKEN
  });

  return github;
};

getPRStatus = function(owner, repo, ref, updatedAt, id, callback) {
  var github = setupGithubApi();

  github.repos.getCombinedStatus({
    owner: owner,
    repo: repo,
    ref: ref
  }, function(err, combinedStatus) {
    // console.log(combinedStatus);
    var status = 'none';
    if (combinedStatus.total_count > 0) {
      status = combinedStatus.state
      // all checks must be completed before annoucing a failure
      if (status == "failure" || status == "error") {
        for (var i = combinedStatus.statuses.length - 1; i >= 0; i--) {
          if (combinedStatus.statuses[i].state == 'pending') {
            status = 'pending';
            break;
          }
        }
      }
      // if a status succeeds, only notify if the initiating status was the last.
      else if (status == 'success' && id && updatedAt)
        for (var i = combinedStatus.statuses.length - 1; i >= 0; i--) {
          var item = combinedStatus.statuses[i];
          var date = new Date(item.updated_at);
          if (item.id != id && date > updatedAt) {
            status = 'no-op';
            break;
          }
        }
    }
    // console.log('status: '+ status);
    return callback(status);
  });
};

buildStatusLine = function(status) {
  if (status == "failure" || status == "error") {
    return "\n*Ah, Mediocre!* Checks have failed.";
  } else if (status == "success") {
    return "\n*You shall ride eternal. Shiny, and chrome.* Checks have succeeded";
  }
  return '';
};

buildMentionLine = function(body) {
  var mentioned, mentioned_line, ref, unique;
  mentioned = (ref = body) != null ? ref.match(/(^|\s)(@[\w\-\/]+)/g) : void 0;
    if (mentioned) {
      unique = function(array) {
        var i, key, output, ref1, results, value;
        output = {};
        for (key = i = 0, ref1 = array.length; 0 <= ref1 ? i < ref1 : i > ref1; key = 0 <= ref1 ? ++i : --i) {
          output[array[key]] = array[key];
        }
        results = [];
        for (key in output) {
          value = output[key];
          results.push(value);
        }
        return results;
      };

      mentioned = mentioned.filter(function(nick) {
        var slashes;
        slashes = nick.match(/\//g);
        return slashes === null || slashes.length < 2;
      });

      mentioned = mentioned.map(function(nick) {
        return nick.trim();
      });

      mentioned = unique(mentioned);

      mentioned_line = "\nMentioned: " + (mentioned.join(", "));
    } else {
      mentioned_line = '';
    }
    return mentioned_line;
};
