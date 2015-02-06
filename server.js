//////////
//Setup //
//////////
var express = require('express'),
	app = express(),
    http = require('http'),
    cors = require('cors'),
	constants = require('./config/constants'),
	mongoose = require('mongoose'),
	Schema  = mongoose.Schema,
	bodyParser = require('body-parser'),
	morgan = require('morgan'),
	jwt = require('jsonwebtoken'),
	UserModel = require('./source/js/models/User.model'),
	db;

//////////////////////
//Application setup //
//////////////////////
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(morgan("dev"));
app.use(cors());
app.set('port', 3000);
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*'); //allowed for all domains
    res.setHeader('Access-Control-Allow-Methods', '*'); //operations allowed for this domain
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization'); //headers allowed
    next();
});

///////////////////////////////////////////
//Listen (start app with node server.js) //
///////////////////////////////////////////
http.createServer(app).listen(app.get('port'), function(){
    console.log('LISTENING on port: ' + app.get('port'));
});


//////////////////////////
//Connecting Database	//
//////////////////////////
mongoose.connect(constants.MONGO_DB_CONNECTION_URL);
mongoose.set('debug', true);

db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB CONECTION ERROR. Please make sure that MongoDB is running. '));
db.once('open', function databaseOpenCallback() {
	console.log('Connected on DATABASE');
});


///////////////
//OPERATIONS //
///////////////


//////////
//LOGIN //
//////////
app.post('/auth/login', function(req, res) {
  UserModel.findOne({ login: req.body.login }, '+password', function(err, user) {
    if (!user) {
      return res.status(401).send({ message: 'Wrong email and/or password' });
    }

    user.comparePassword(req.body.password, function(err, isMatch) {
      if (!isMatch) {
        return res.status(401).send({ message: 'Wrong email and/or password' });
      }

      res.send({ token: createToken(user) });
    });
  });
});


//Google Login
app.post('/auth/google', function(req, res) {
    var accessTokenUrl = 'https://accounts.google.com/o/oauth2/token',
        peopleApiUrl = 'https://www.googleapis.com/plus/v1/people/me/openIdConnect';
        params = {
            code: req.body.code,
            client_id: req.body.clientId,
            client_secret: config.GOOGLE_SECRET,
            redirect_uri: req.body.redirectUri,
            grant_type: 'authorization_code'
        };

    console.log('hey');
    // Step 1. Exchange authorization code for access token.
    request.post(accessTokenUrl, { json: true, form: params }, function(err, response, token) {
        var accessToken = token.access_token,
            headers = { Authorization: 'Bearer ' + accessToken };

    // Step 2. Retrieve profile information about the current user.
    request.get({ url: peopleApiUrl, headers: headers, json: true }, function(err, response, profile) {
        var token, payload;

        // Step 3a. Link user accounts.
        if (req.headers.authorization) {
            UserModel.findOne({ google: profile.sub }, function(err, existingUser) {

                if (existingUser) {
                    return res.status(409).send({ message: 'There is already a Google account that belongs to you' });
                }

                token = req.headers.authorization.split(' ')[1];
                payload = jwt.decode(token, config.TOKEN_SECRET);

                UserModel.findById(payload.sub, function(err, user) {

                    if (!user) {
                        return res.status(400).send({ message: 'User not found' });
                    }

                    user.google = profile.sub;
                    user.displayName = user.displayName || profile.name;
                    user.save(function() {
                        token = createToken(user);
                        res.send({ token: token });
                    });
                });
            });
      } else {
        // Step 3b. Create a new user account or return an existing one.
        UserModel.findOne({ google: profile.sub }, function(err, existingUser) {
          if (existingUser) {
            return res.send({ token: createToken(existingUser) });
          }

          var user = new UserModel();
          user.google = profile.sub;
          user.displayName = profile.name;
          user.save(function(err) {
            var token = createToken(user);
            res.send({ token: token });
          });
        });
      }
    });
  });
});


//Authenticates to get JWT token
app.post('/authenticate', function(req, res) {
    UserModel.findOne({login: req.body.login, password: req.body.password}, function(err, user) {
        console.log(user, 'USER FOUND');
        if (err) {
            res.json({
                type: false,
                data: "ERROR OCURRED: " + err
            });
        } else {
            if (user) {
               res.json({
                    type: true,
                    data: user,
                    token: user.token
                });
            } else {
                res.json({
                    type: false,
                    data: "Incorrect login/password"
                });
            }
        }
    });
});


//Creates a new user and a new JWT Token
app.post('/signin', function(req, res) {
    console.log('Signing:', req.body.login);
    UserModel.findOne({login: req.body.login, email: req.body.email}, function(err, user) {
        if (err) {
            res.json({
                type: false,
                data: "Error occured: " + err
            });
        } else {
            if (user) {
                res.json({
                    type: false,
                    data: "User already exists!"
                });
            } else {//Creates user
                var newUserModel = new UserModel();
                console.log(newUserModel, 'model');
                newUserModel.name = req.body.name;
                newUserModel.login = req.body.login;
                newUserModel.email = req.body.email;
                newUserModel.password = req.body.password;

                newUserModel.save(function(err, user) {
                    user.token = jwt.sign(user, process.env.JWT_SECRET);
                    user.save(function(err, user1) {
                        res.json({
                            type: true,
                            data: user1,
                            token: user1.token
                        });
                    });
                })
            }
        }
    });
});

function _ensureAuthorized(req, res, next) {
    var bearerToken, bearer,
        bearerHeader = req.headers["authorization"];

    if(typeof bearerHeader !== 'undefined') {
        bearer = bearerHeader.split(" ");
        bearerToken = bearer[1];
        req.token = bearerToken;
        next();
    } else {
        res.send(403);
    }
}

//Ensures autorizations to access any page
app.get('/', _ensureAuthorized, function(req, res) {
    UserModel.findOne({token: req.token}, function(err, user) {
        if (err) {
            res.json({
                type: false,
                data: "Error occured: " + err
            });
        } else {
            res.json({
                type: true,
                data: user
            });
        }
    });
});