var mongodb = require('mongodb').native();
var Db = mongodb.Db;
var Connection = require('mongodb').Connection;
var Server = require('mongodb').Server;
var BSON = require('mongodb').BSON;
var ObjectID = require('mongodb').ObjectID;
var fs = require('fs');
var http = require('http');
var crypto = require('crypto');

BlogAdmin = function(host, port) {
  this.db= new Db('node-mongo-blog', new Server(host, port, {auto_reconnect: true}), {w:1,journal:true,fsync:false});
  this.db.open(function(err,client){
	if(err)
	  console.log("DB connection error : " + err);
  });
};

BlogAdmin.prototype.getCollection= function(collectionName, callback) {
  this.db.collection(collectionName, function(error, collection) {
    if( error ) {
	   console.log(error);
	   callback(error);
	}
    else {
	  callback(null, collection);
	}
  });
};

BlogAdmin.prototype.deleteUser = function (username, callback) {
// get collection
  this.getCollection('users', function(error, user_collection) {
      if( error ) {
        console.log(error);
        callback(error);
      }
      else {
        user_collection.remove({userName:username},function(error,result) {
          if(error)
            callback(error);
          else callback(null, result);
        });
      }
    });
};

// Add or update a user
BlogAdmin.prototype.addUser = function (user, callback) {
	// get collection
	this.getCollection('users', function(error, user_collection) {
      if( error ) {
      	console.log(error);
      	callback(error);
      }
      else {
      	// encrypt password if not empty
        if(user.password != "" && user.password != null) { 
        	var hmac = crypto.createHmac("sha1", 'auth secret');
  		    hmac.update(user.password);
  		    var signature = hmac.digest("hex");
  		    user.password = signature;
        }
        else
		{
          user.password = null;
		}
		
      	//check if user exists
      	user_collection.findOne({userName:user.userName}, function(error, result) {
		  if( error ) {
		    callback(error);
		  }
          else {
             if(result != undefined) {
              if(user.password)
           	     user_collection.update({_id:result._id} ,  {"$set": {email: user.email, password:user.password, admin:user.admin}}, function(error, article){
	               if( error ) {
                	callback(error);
          	     }
          	     else { 
                    if(article != undefined) {
                      callback(null, article);
                    }
          	     }
          	  });
              else
                 user_collection.update({_id:result._id} ,  {"$set": {email: user.email, admin:user.admin}}, function(error, article){
                 if( error ) {
                  callback(error);
                 }
                 else { 
                    if(article != undefined) {
                      callback(null, article);
                    }
                 }
              });
            }
             else {
                user_collection.insert(user, function() {
                callback(null, user);
               });
             }
          }
        });
      }
	});
};

BlogAdmin.prototype.findUser = function( userName, callback) {
	this.getCollection('users', function(error, user_collection) {
      if( error ) {
      	console.log(error);
      	callback(error);
      }
      else {
      	user_collection.findOne({userName:userName}, function(error, result) {
          if( error ) callback(error)
          else {
      		callback(result);
      	  }
      	});
      }
  });
};

BlogAdmin.prototype.getLog = function( currentUser, isadmin, callback) {
  this.getCollection('logData', function(error, log_collection) {
      if( error ) {
        console.log(error);
        callback(error);
      }
      else {
        if(!isadmin) {
          log_collection.find({username:currentUser}).sort('dateCreated',-1).toArray(function(error, result) {
            if( error ) callback(error)
            else {
            callback(null,result);
            }
          });
        }
        else {
          log_collection.find().sort('dateCreated',-1).toArray(function(error, result) {
            if( error ) callback(error)
            else 
            callback(null,result);
            });
          }
        } 
      });
  };

BlogAdmin.prototype.getUsers = function( currentUser, isadmin, callback) {
  this.getCollection('users', function(error, user_collection) {
      if( error ) {
        console.log(error);
        callback(error);
      }
      else {
        if(!isadmin) {
          user_collection.find({userName:currentUser}).toArray(function(error, result) {
            if( error ) callback(error)
            else {
            callback(null,result);
            }
          });
        }
        else {
          user_collection.find().toArray(function(error, result) {
            if( error ) callback(error)
            else 
            callback(null,result);
            });
          }
        } 
      });
  };

BlogAdmin.prototype.login = function( username, password, callback) {
	this.getCollection('users', function(error, user_collection) {
      if( error ) {
      	console.log(error);
      	callback(error);
      }
      else {
      	user_collection.findOne({userName:username}, function(error, result) {
          if( error ) callback(error)
          else {
            if(result) {
            	// encrypt password
      			var hmac = crypto.createHmac("sha1", 'auth secret');
				hmac.update(password);
				var signature = hmac.digest("hex");
				if( signature == result.password)
					callback(result);
				else
					callback(null);
            }
            else
            	callback(null);
        }
       });
      }
  });
};



exports.BlogAdmin = BlogAdmin;