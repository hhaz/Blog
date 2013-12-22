var express = require('express');
var nib = require('nib');
var connect = require('connect');
var stylus = require('stylus');
var fs = require('fs');
var util = require('util');
var MemoryStore = express.session.MemoryStore;
var https = require('https');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var ArticleProvider = require('./articleprovider-mongodb').ArticleProvider;
var BlogAdmin = require('./blog-admin').BlogAdmin;
var crypto = require('crypto');

var options = {
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.crt')
};

var app = module.exports = express();
https.createServer(options, app).listen(443);

var nbPagesComments = 5;
var nbPagesFiles = 5;
var nbPagesPosts = 5;
var nbPosts;
var sessionTimeOut = 18000000; //300 minutes

app.use(express.limit('400mb'));
app.use(express.cookieParser());
app.use(express.session({maxAge:sessionTimeOut,  store: new MemoryStore(), secret:'my secret'}));

var server = connect();

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
  app.use('/images/', express.static(__dirname + "/images/"));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

var articleProvider = new ArticleProvider('localhost', 27017);
var blogAdmin       = new BlogAdmin('localhost', 27017);
var type = Function.prototype.call.bind( Object.prototype.toString );


passport.use(new LocalStrategy(
  function(username, password, done) {
     blogAdmin.getCollection('users', function(error, user_collection) {
      if( error ) {
      	console.log(error);
      	callback(error);
      }
      else {
      	user_collection.findOne({userName:username}, function(error, user) {
          if( error ) callback(error)
          else {
            if(user) {
            	// encrypt password
      			var hmac = crypto.createHmac("sha1", 'auth secret');
				hmac.update(password);
				var signature = hmac.digest("hex");
				if( signature == user.password)
					return done(null, user);
				else
					return done(null, false, { message: 'Incorrect password.' });
            }
            else
            	return done(null, false, { message: 'Incorrect username.' });
        }
       });
      }
  });
  }));
  
passport.serializeUser(function(user, done) {
  done(null, user.userName);
});

passport.deserializeUser(function(user, done) {
  blogAdmin.findUser( user, function(user) {
    done(null, user);
  });
});

// Security hook
function loadUser (req, res, next) {
	if (req.user) {
	console.log("name : " + req.user.userName);
    req.currentUser = req.session.user_id;
    req.session.maxAge = Date.now() + sessionTimeOut;
    next();
  } else {
    res.redirect('/blog/login');
  }
  /*if (req.session.user_id) {
    req.currentUser = req.session.user_id;
    req.session.maxAge = Date.now() + sessionTimeOut;
    next();
  } else {
    res.redirect('/blog/login');
  }*/
}

app.set('view options', { layout: true });
app.set('view options', { pretty: true });
app.locals.pretty = true; 

articleProvider.countArticles(function(error,count) {
      nbPosts = count;
      console.log(nbPosts);
});

app.get('/', loadUser, function(req, res){
    articleProvider.findAll( 1, nbPagesPosts , function(error,docs){
        res.render('index', {
            title: 'Blog',
            articles:docs,
            nbPosts:nbPosts,
            nbPagesPosts:nbPagesPosts,
            pageId:1,
            currentSession:req.session
        });
    })
});


app.post('/delete', loadUser, function(req, res){
    articleProvider.delete( req.param('id') , function(error){
        res.redirect('back');
    })
});

app.post('/deleteFile', loadUser, function(req, res){
  if(typeof(req.param('checkid')) !='undefined') {
        articleProvider.deleteFile(req.param('_id'), req.param('checkid'), function (error) {
 
        });
   }
  res.redirect('/blog/' + req.param('_id') + '/1');
});

app.post('/deleteComment', loadUser, function(req, res){
        articleProvider.deleteComment(req.param('postid'), req.param('userid'), req.param('comment'), function (error) {
          res.redirect('back');
        });
});

app.get('/:pageId', loadUser ,function(req, res){
    articleProvider.findAll( req.params.pageId, nbPagesPosts , function(error,docs){
        res.render('index', {
            title: 'Blog',
            articles:docs,
            nbPosts:nbPosts,
            nbPagesPosts:nbPagesPosts,
            pageId:req.params.pageId,
            currentSession:req.session
        });
    })
});

app.get('/blog/login', function(req, res) {
    //blogAdmin.addUser( {userName:'hervea', password:'hervea', email:'herve.azoulay@free.fr', admin:true},function(error) { console.log("hgjgh"); console.log(error);});
    req.session.user_id = null;
    res.render('login.jade', { 
        title: 'Login'
    });
});

/*app.post('/blog/login', function(req, res){
    blogAdmin.login(req.param('username'), req.param('password'),function(result) {
      if(result) {
        req.session.user_id = result.userName;
        req.session.cookie.maxAge = sessionTimeOut;
        req.session.isAdmin = result.admin;
        req.session.cookie.token = Math.floor((Math.random()*100)+1);
        console.log( "User : " + result.userName + " has logged in"); 
        articleProvider.logInformation(req.connection.remoteAddress, result.userName, function(error) {});
        res.redirect('/');
      }
      else
        res.redirect('/blog/login');
    });
});*/

app.post('/blog/login',
  passport.authenticate('local', { successRedirect: '/',
                                   failureRedirect: '/login',
                                   failureFlash: true })
); 


app.get('/blog/new', loadUser ,function(req, res) {
    res.render('blog_new.jade', { 
        title: 'New Post'
    });
});



app.post('/blog/new', loadUser ,function(req, res){
    var formattedBody = req.param('body').replace(/\n/g, "<br/>");
    articleProvider.save({
        title: req.param('title'),
        body: formattedBody,
        user:req.session.user_id
    }, function( error, docs) {
        nbPosts += 1;
        res.redirect('/')
    });
}); 


//Upload
app.post('/upload', loadUser ,function(req, res){
  console.log( "body :" + req.body);
  console.log( "filenames : " + req.param('fileNames'));
  console.log( "id : " + req.param('_id'));
    if(req.files.fileNames.name != '') {
      if( Array.isArray(req.files.fileNames) ) {
        req.files.fileNames.forEach( function(elem) { 
        data = fs.readFileSync(elem.path);
        articleProvider.uploadDocument(req.param('_id'), elem.name ,data,req.session.user_id, function() {
          });
        });
      }
      else {
        data = fs.readFileSync(req.files.fileNames.path);
        articleProvider.uploadDocument(req.param('_id'), req.files.fileNames.name ,data,req.session.user_id, function() {
          });
      }
      res.redirect('/blog/' + req.param('_id') + '/1');
    }
    else
    {
      console.log( 'no files');
    }
}); 


//Download
app.get('/download/:docId/:docName', loadUser ,function(req,res) {
  articleProvider.downloadFile( req.params.docId, function (data) {
    res.send(data);
  })
});

app.post('/download', loadUser ,function(req,res) {
  if(typeof(req.param('checkid')) !='undefined') {
      articleProvider.downloadFiles( req.param('checkid'), function (data) {
        res.set({'Content-Type' :'application/octet-stream', 
          'Content-length' : data.length , 
          'Content-disposition' :'attachment; filename=' + req.param('_title').replace(/ /g,'_') + '.zip'});
        res.send(data);
        res.on( 'data' , function(data) { console.log ('yo')});
      });
 }
 else
	res.redirect('/blog/' + req.param('_id') + '/1');
});


app.get('/blog/:id/:page', loadUser , function(req, res) {
    articleProvider.findById(req.params.id, function(error, article) {
        res.render('blog_show.jade',
        { 
            title: article.title,
            article:article,
            comments:article.comments,
            page:req.params.page,
            nbPagesComments:nbPagesComments,
            files:article.files,
            nbPagesFiles:nbPagesFiles,
            currentUser:req.session.user_id,
            currentSession:req.session
        });
    });
});

app.post('/blog/addComment', loadUser , function(req, res) {
    var currentArticle;
    var commentsLength = 0;
    articleProvider.findById(req.param('_id'), function(error, Article) {
      currentArticle = Article;
      commentsLength = currentArticle.comments.length;
    }); 
    var formattedComments = req.param('comment').replace(/\r\n/g, "<br/>");
    articleProvider.addCommentToArticle(req.param('_id'), {
        person: req.session.user_id,
        comment: formattedComments,
        created_at: new Date()
       } , function( error, docs) {
           res.redirect('/blog/' + req.param('_id') + '/' + Math.ceil((commentsLength +1)/nbPagesComments))
       });
});

app.post('/blog/addUser', loadUser , function(req,res) {
  if(req.param('username') != "" && req.param('username') != null)
   blogAdmin.addUser({userName:req.param('username'), password:req.param('password'), email:req.param('email'), admin:req.param('admin')}, function () {
    res.redirect('back');
  });
 else
  res.redirect('back');
});

app.post('/blog/modifyUser', loadUser , function(req,res) {
  blogAdmin.addUser({userName:req.param('username2'), password:req.param('password2'), email:req.param('email2'), admin:req.param('admin2')}, function () {
    res.redirect('back');
  })
});

app.post('/blog/deleteUser', loadUser , function(req,res) {
  blogAdmin.deleteUser(req.param('username2'), function () {
    res.redirect('back');
  })
});

app.get('/blog/manageUser', loadUser , function(req, res) {
  blogAdmin.getUsers( req.session.user_id , req.session.isAdmin, function (error,result) {
    res.render('user.jade', { 
        title: 'Manage Users',
        admin:req.session.isAdmin,
        users:result
    });
  });
});

app.get('/blog/ViewLog', loadUser , function(req, res) {
  blogAdmin.getLog( req.session.user_id , req.session.isAdmin, function (error,result) {
    res.render('viewlog.jade', { 
        title: 'View Log',
        admin:req.session.isAdmin,
        logs:result
    });
  });
});

app.get('/api/login', function(req,res) {
  userName = req.query["user"];
  password = req.query["password"];
  console.log("user = "  + req.query["user"]);
  console.log("password = "  + req.query["password"]);
});

app.get('/api/getList', loadUser ,function(req,res) {
  res.send([{name:'wine1'}, {name:'wine2'}, {sessionid:req.session}]);
}
);

app.listen(3000);


