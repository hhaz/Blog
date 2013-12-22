var mongodb = require('mongodb').native();
var Db = mongodb.Db;
var Connection = require('mongodb').Connection;
var Server = require('mongodb').Server;
var BSON = require('mongodb').BSON;
var ObjectID = require('mongodb').ObjectID;
var GridStore = mongodb.GridStore;
var Grid = mongodb.Grid;
var fs = require('fs');
var http = require('http');
var ZipWriter = require("moxie-zip").ZipWriter;


ArticleProvider = function(host, port) {
  this.db= new Db('node-mongo-blog', new Server(host, port, {auto_reconnect: true}), {w:1,journal:true,fsync:false});
  this.db.open(function(err,client){
  });
  this.grid = new Grid(this.db, 'fs');
};

//getCollection

ArticleProvider.prototype.getCollection= function(collectionName, callback) {
  this.db.collection(collectionName, function(error, collection) {
    if( error ) callback(error);
    else callback(null, collection);
  });
};

//Upload
ArticleProvider.prototype.uploadDocument = function( articleId, filename, buffer, userid, callback){
  localGrid = this.grid;
  localObject = this;
  var docId;
  this.grid.put(buffer, {filename:filename}, function(err, result) {
      // Update the article
      if(err) {
        console.log(err);
      }
      else {
        docId = result._id;
        console.log( "docID : " + docId + " fileName : " + filename + " Buffer size : " + buffer.length);
        localGrid.get(docId, function(err, data) {
        localObject.getCollection('articles',function(error, article_collection) {
          if( error ) callback( error );
          else {
            article_collection.update(
            {_id: article_collection.db.bson_serializer.ObjectID.createFromHexString(articleId)},
            {"$push": {files: {id:docId,name:filename,size:buffer.length,userid:userid}}},
            function(error, article){
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
    });
  });
  }
});
};

//Download
ArticleProvider.prototype.downloadFile = function (docId , callback) {
 var idDoc = new ObjectID(docId);
 this.grid.get(idDoc, function(error, data) {
    if( error ) {
      console.log(error);
      callback( error );
    }
    else {
      callback(data);
    }
 });
};


ArticleProvider.prototype.downloadFiles = function (docIds,callback ) {
localGrid = this.grid;
arrayTmp = new Array();
var i=0;
if( Array.isArray(docIds)) {
  arrayTmp = docIds;
}
else {
  arrayTmp[0] = docIds;
}

var zip = new ZipWriter();

arrayTmp.forEach( function(doc) {
  var docID = doc.split(',');
  var idDoc = new ObjectID(docID[0]); 
  var docName = docID[1];
  localGrid.get(idDoc, function(error, data) {
  console.log ("idDoc : " + idDoc);
    if( error ) {
      console.log(error);
      callback( error );
    }
    else { 
		zip.addData(docName, data);  
		i++;
		if(i == arrayTmp.length) {
			zip.toBuffer(function(buf) {
			  callback(buf);
		});
		}
	  }
 });
});
};

//Get global number of posts
ArticleProvider.prototype.countArticles = function(callback) {
  this.getCollection('articles', function(error, article_collection) {
  if( error ) callback(error)
  else {
    article_collection.count(function(error, count){
    if( error ) callback(error)
     else {
      callback(null, count);
     }
    });
  }
});
};

//findAll
ArticleProvider.prototype.findAll = function(from, nbPagesPosts, callback) {
    this.getCollection('articles', function(error, article_collection) {
      if( error ) callback(error)
      else {
        article_collection.find().sort('created_at',-1).skip((from-1)*nbPagesPosts).limit(nbPagesPosts).toArray(function(error, results) {
          if( error ) callback(error)
          else 
            {
              results.forEach( function(elem) { 
              date =  new Date(elem.created_at);
              elem.created_at = date.toDateString();
              elem.nbComments = elem.comments.length;
              elem.nbfiles = elem.files.length;
              });
              callback(null, results);
            }
        });
      }
    });
};

// Logging function
ArticleProvider.prototype.logInformation = function (ip, username, callback) {
  this.getCollection('logData', function(error, logCollection) {
    logCollection.insert({ip: ip, username: username,
         dateCreated : new Date()},function() {
           callback(null, null);
        })
  });
}

//findById

ArticleProvider.prototype.findById = function(id, callback) {
    this.getCollection('articles', function(error, article_collection) {
      if( error ) callback(error)
      else {
        article_collection.findOne({_id: article_collection.db.bson_serializer.ObjectID.createFromHexString(id)}, function(error, result) {
          if( error ) callback(error)
          else 
            {
              callback(null, result);
            }
        });
      }
    });
};

//Delete
ArticleProvider.prototype.delete = function(id , callback) {
localGrid = this.grid;
localObject = this;  
this.getCollection('articles', function(error, article_collection) {
      if( error ) callback(error)
      else {
        // Check for attached files
        article_collection.findOne({_id: article_collection.db.bson_serializer.ObjectID.createFromHexString(id)}, function(error, result) {
          if(error) callback(error)
          else {
            result.files.forEach(function(elem) {
            localGrid.delete(elem.id, function(error){
              if(error) callback(error);
            });
           });
          }
        });
        article_collection.remove({_id: article_collection.db.bson_serializer.ObjectID.createFromHexString(id)}, function(error, result) {
          if( error ) callback(error)
          else 
            {
              callback(null);
            }
        });
      }
    });
};


//Delete one comment attached to a post
ArticleProvider.prototype.deleteComment = function(postid, userid , comment , callback) {
this.getCollection('articles', function(error, article_collection) {
      if( error ) callback(error)
      else {
        article_collection.findOne({_id: ObjectID(postid)}, function(error, result) {
          if(error) callback(error)
          else {
            article_collection.update({_id: ObjectID(postid)}, {"$pull": {comments: {person:userid,comment:comment}}}, function(error, result) {
            if( error ) callback(error)
            else 
            {
              callback(null);
            }
          });
        }
       });
      }
    });
};     

//Delete selected files attached to a post
ArticleProvider.prototype.deleteFile = function(postid, files , callback) {
localGrid = this.grid;
localObject = this;  
console.log(" postid : " + postid);
arrayTmp = new Array();
if( Array.isArray(files)) {
  arrayTmp = files;
}
else {
  arrayTmp[0] = files;
}
this.getCollection('articles', function(error, article_collection) {
   arrayTmp.forEach(function(fileid) {
      if( error ) callback(error)
      else {
        // Check for attached files
        article_collection.findOne({_id: ObjectID(postid)}, function(error, result) {
          if(error) callback(error)
          else {
            console.log("result : " + result + " postid : " + postid);
            result.files.forEach(function(elem) {
            if(elem.id == fileid)
            {
              localGrid.delete(elem.id, function(error){
              if(error) callback(error);
              else {
                article_collection.update({_id: ObjectID(postid)}, {"$pull": {files: {id:ObjectID(fileid)}}}, function(error, result) {
                if( error ) callback(error)
                else 
                {
                  callback(null);
                }
              });
            }
            });
           }
        });
      }
    });
   }
   });     
});
};

//save
ArticleProvider.prototype.save = function(articles, callback) {
    this.getCollection('articles', function(error, article_collection) {
      if( error ) callback(error)
      else {
        if( typeof(articles.length)=="undefined")
          articles = [articles];

        for( var i =0;i< articles.length;i++ ) {
          article = articles[i];
          article.created_at = new Date();
          if( article.comments === undefined ) article.comments = [];
          if( article.files === undefined ) article.files = [];
          for(var j =0;j< article.comments.length; j++) {
            article.comments[j].created_at = new Date();
          }
        }
        article_collection.insert(articles, function() {
          callback(null, articles);
        });
      }
    });
};

ArticleProvider.prototype.getArticle = function( articleId, callback) {
  this.getCollection('articles', function(error, article_collection) {
      if( error ) callback(error)
      else {
        callback( null, article_collection.find({_id: article_collection.db.bson_serializer.ObjectID.createFromHexString(articleId)}));
      } 
  });
};

ArticleProvider.prototype.addCommentToArticle = function(articleId, comment, callback) {
  this.getCollection('articles',function(error, article_collection) {
    if( error ) callback( error );
    else {
      article_collection.update(
        {_id: article_collection.db.bson_serializer.ObjectID.createFromHexString(articleId)},
        {"$push": {comments: comment}},
        function(error, article){
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
  });
};
exports.ArticleProvider = ArticleProvider;

