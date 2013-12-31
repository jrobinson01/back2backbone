var express = require("express"),
	path = require("path"),
	fs = require("fs"),
	_ = require("underscore"),
	mongoose = require("mongoose"),
	Backbone = require("backbone");
	var bbsuper = require("./lib/backbone-super");
	bbsuper(Backbone, _);


var uniqueId = function(){
    // always start with a letter (for DOM friendlyness)
    var idstr=String.fromCharCode(Math.floor((Math.random()*25)+65));
    do {
        // between numbers and characters (48 is 0 and 90 is Z (42-48 = 90)
        var ascicode=Math.floor((Math.random()*42)+48);
        if (ascicode<58 || ascicode>64){
            // exclude all chars between : (58) and @ (64)
            idstr+=String.fromCharCode(ascicode);
        }                
    } while (idstr.length<32);

    return (idstr);
};
	
var Back2Backbone = function(config) {
	
	var config = (config !== undefined) ? config : { port:"3000", dbName:"db", dbHost:"localhost"};
	
	//create the server
	var app = this.app = express();
	
	
	//connect to mongodb
	mongoose.connect("mongodb://"+config.dbHost+"/"+config.dbName);
	this.db = mongoose.connection;
	
	this.ObjectId = mongoose.Schema.ObjectId;
	this.db.on("error", function(err) {
		console.error("db connection error:", err);
	});
	
	//configure
	this.app.configure( function() {
		app.use(express.bodyParser());
		app.use(express.methodOverride());
		//allow cross-domain access
		app.use("/", function(req, res, next){
			res.header("Access-Control-Allow-Origin","*");
			res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type, Accept");
			res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
			next();
		});
		app.use(app.router);
	});
	
	//model and collection instance caches
	this.models = {};
	this.collections = {};
	
	//start the server
	this.app.listen(config.port);
};

//easy access to prototype..
var b2b = Back2Backbone.prototype;
//extend with Backbone Events!
_.extend(b2b, Backbone.Events);

b2b.Model = Backbone.Model.extend({
	
	//overwrite save to write to the mongo db
	set:function(key, val, options) {
		options = (options|| {});
		options.validate = true;
		this._super(key, val, options);
		valid = this.isValid();
		console.log("b2b set called _super.set. valid?:", valid);
		if(valid != false) {
			console.log("b2b model is valid. saving!");
			this.save();
		} else {
			//hmmm...
			console.log("b2b model is invalid!");
		}
	},
	
	save:function(key, value, options) {
		console.log("b2b model save called! (NOT IMPLEMENTED)");
		//create or get a mongoose model and save it.
		//add to collection?
		//...
	}
});

b2b.createRoutes = function(models) {
	
	for(var i in models) {
		
		var temp = models[i].prototype;//new models[i]();
		//console.log(i, ".urlRoot", temp.urlRoot);
		//console.log(i,".url", temp.url());
		var self = this;
		
		//create the get collection route
		this.app.get(temp.urlRoot, function(req, res) {
			console.log("getting:", req.url);
			var modelName = req.url.split("/")[1];
			console.log("modelName:", modelName);
			self.trigger(modelName+":CollectionRequest", {url:req.url});//also include collection in event?
			//look for a collection named modelName.
			//if it exists, call toJSON and return.
			//otherwise return a 404.
			var coll = self.collections[modelName];
			if(coll !== undefined) {
				console.log("collection found!");
				return res.json(200, coll);
			} else {
				return res.json(404, {message: "the '"+ modelName + "' collection doesn't exist. Post a new "+modelName+" model to '/"+modelName+"' to create one."});
			}
		});
		
		//create the get ONE model route
		this.app.get(temp.urlRoot+"/:id", function(req, res) {
			console.log("getting model:", req.url);
			var id = req.params.id;
			var modelName = req.url.split("/")[1];
			console.log("modelName:", modelName);
			//if a collection of modelName exists
			//look inside and return the model.toJSON
			//otherwise return a 404.
			var coll = self.collections[modelName];
			if(coll !== undefined) {
				//console.log("item exists in collection?", coll.get(id));
				var item = coll.get(id);
				if(item !== undefined) {
					return res.json(200, item);
				} else {
					return res.json(404, {message:"item doesn't exist!"});
				}
			} else {
				return res.json(404, {message:"The '"+modelName+"' collection doesn't exist. Post a new "+modelName+" model to '/"+modelName+"' to create one."});
			}
				
			//return res.send(200, {});
		});
		
		//create the update route (put)
		this.app.put(temp.urlRoot+"/:id", function(req, res) {
			console.log("updating model:", req.url);
			var id = req.params.id;
			var modelName = req.url.split("/")[1];
			//console.log("modelName", modelName);
			//get the model then update it.
			//if validation fails, respond with error (409?)
			var coll = self.collections[modelName];
			if(coll != undefined) {
				var item = coll.get(id);
				item.set(req.body);
				if(item.isValid()) {
					return res.send(204,{});
				} else {
					//TODO:return more useful error message here.
					return res.send(409, {message:"model didn't pass validation."})
				}
			}
			
			return res.send(200, {});
		});
		
		//create the create route (post)
		this.app.post(temp.urlRoot, function(req, res){
			console.log("create model url:", req.url, req.body);
			var modelName = req.url.split("/")[1];//TODO: get the model name by comparing req.url to our know models' urlRoot properties?
			//look up model...
			console.log("model definition exists:", models[modelName]);
			var model = new models[modelName](req.body);
			
			//listen to model?
			model.on("all", function(event) {
				console.log("b2b created model: on event:", event);
			});
			
			console.log("created model!", model.attributes, model.isValid());
			
			if(model.isValid()) {
				
				//add to collection
				var coll = self.collections[modelName];
				if(coll == undefined) {
					coll = self.collections[modelName] = new Backbone.Collection();
					coll.model = models[modelName];
				}
				model.set("id", uniqueId());
				coll.add(model);
				console.log("valid model added to collection!", coll.length, model.attributes);	
				return res.send(201, model);//created it!
			} else {
				//model is invalid! respond with error..delete model
				console.log("new model is invalid. sorry.");
				return res.send(400, {message:"the new model did not validate and was not created."});
			}
			
		});
		
	}
};

exports = module.exports = Back2Backbone;