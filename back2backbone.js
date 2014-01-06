var express = require("express"),
	path = require("path"),
	fs = require("fs"),
	_ = require("underscore"),
	mongoose = require("mongoose"),
	Backbone = require("backbone");
	var bbsuper = require("./lib/backbone-super");
	bbsuper(Backbone, _);

/**
 * TODO: update/put requests are not getting saved to the db.
 */
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
	
	//local caches
	this.modelTemplates = {};//bb model definitions
	this.collections = {};// bb collection INSTANCES
	this.mongooseModels = {};//mongoose models
	
	//start the server
	this.app.listen(config.port);
};

//easy access to prototype..
var b2b = Back2Backbone.prototype;
//extend with Backbone Events!
_.extend(b2b, Backbone.Events);

//extend backbone.Model
b2b.Model = Backbone.Model.extend({
	
	/*
	
	set:function(key, val, options) {
		options = (options|| {});
		options.validate = true;
		this._super(key, val, options);//will call OUR base version of set.
		valid = this.isValid();
		console.log("b2b set called _super.set. valid?:", valid);
		if(valid != false) {
			console.log("b2b model is valid. saving (DISABLED, perhaps we don't auto-save and let our subclasses handle it more naturally.)!");
			//this.save();
		} else {
			//hmmm...
			console.log("b2b model is invalid!");
			return valid;//does set ever return false (when validation fails§)?
		}
	},
	*/
	set:function(key, val, options) {
		console.log("base set called.", key, val, options);
		if(this.isValid()) {
			console.log("valid. calling super. AND save.")
			this._super(key, val, options);
			console.log("saving from set.");
			this.save();
		}
	},
	
	//override save to write to the mongo db
	save:function(key, value, options) {
		console.log("b2b model save called!", this.get("id"));
		var self = this;
		if(this.get("id") !== undefined) {
			//update
			console.log("updating in save:", this.get("id"), this.attributes);
			this.mongoModel.update({_id:this.get("id")}, this.attributes ,{multi:false}, function(err, data) {
				if(err !== null) {
					console.error("error updating model in mongo:", err);
					//trigger an error event?
					//...
				} else {
					//trigger a save/update event?
					//...
				}
			});
		} else {
			//create
			console.log("creating in save..", this.attributes);
			new this.mongoModel(this.attributes).save(function(err, data) {
				if(err != null) {
					console.error("error creating model in mongo:", err);
					//trigger an error event?
					//..
				} else {
					console.log("yay! created a model into mongo!", data.id);
					//update ourselves with data (particularly id)
					//self.set(data);//caused continuous loop (with commented-out set function above)
					if(data._id !== self.get("id")) {
						self.set("id", data._id);
					}
				}
			});
		}
	},
	
	//override destroy to remove from the mongo db
	destroy:function(options) {
		options = options ? _.clone(options) : {};
		var self = this;
		//remove from mongo if !isNew
		if(!this.isNew()) {
			this.mongoModel.remove({_id:this.get("id")}, function(err, data) {
				if(err !== null) {
					console.error("error deleting!", this.get("id"));
				} else {
					console.log("successful delete!");
					self.trigger("destroy", self, self.collection, options);
					if(options.success) {
						options.success();//call success callback if provided.
					}
					self.off();//remove all event listeners
				}
			});
		} else {
			this.trigger("destroy", this, this.collection, options);
			this.off();//remove all event listeners
		}
	}
});

b2b.createRoutes = function(models) {
	
	for(var i in models) {
		//get a reference to the desired model prototype.
		var temp = models[i].prototype;
		this.modelTemplates[i] = models[i];
		//cache 'this'
		var self = this;
		
		//create mongoose schema's from defaults
		var defaults = temp.defaults;
		var schema = {};
		//console.log(i, "defaults:", defaults);
		for(var a in defaults) {
			if(typeof defaults[a] != "function") {
				schema[a] = {
					type:typeof defaults[a],
					default:defaults[a],
				};
			} else {
				//TODO: figure out what to do with these, how to figure out relationships..
				//console.log("defaults["+a+"] is a function. hopefully designed to build a url..", defaults[a]);
			}
		};
		//console.log(i, "schema:", schema);
		this.mongooseModels[i] = mongoose.model(i, mongoose.Schema(schema, {strict:true})); 
		//icky, but backbone models need to know about their mongooseModel...
		temp.mongoModel = this.mongooseModels[i];
		//console.log("created mongoose model:", this.mongooseModels[i], temp);
		
		//TODO: we also need to restore collections from mongoose.
		//DO this at the end, outside of this loop.
		//this.restoreFromMongo(models)
		
		/** create routes **/
		//TODO: these are all 'first class' routes.
		// we should also examine temp.defaults for functions that tell us
		// what our relationships should be...
		//...

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
					return res.json(200, item.attributes);
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
				var props = {};
				//loop through item.defaults and only use properties
				//that should exist.
				console.log("got item from collection:", item, " coll name:", modelName);
				for(var i in item.defaults) {
					if(req.body[i] !== undefined) {
						props[i] = req.body[i];
					}
				}
				item.set(props);
				//remove this, and instead listenOnce to the item instead so that async operations can
				//be carried out in the items 'set' function.
				// if set is rejected ('invalid' event?), respond with 409, otherwise respond with 204
				if(item.isValid()) {
					return res.send(204,{});
				} else {
					//TODO:return more useful error message here.
					return res.send(409, {message:"model didn't pass validation."+item.validationError})
				}
				
			}
			
			return res.send(200, {});
		});
		
		//create the create route (post)
		this.app.post(temp.urlRoot, function(req, res){
			console.log("create model url:", req.url, req.body);
			var modelName = req.url.split("/")[1];//TODO: get the model name by comparing req.url to our known models' urlRoot properties instead?
			//look up model...
			console.log("model definition exists:", models[modelName]);
			var model = new models[modelName](req.body);
			
			//listen to model - not sure what we'll use this for...
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
				//model.set("id", uniqueId());
				coll.add(model);
				console.log("valid model added to collection!", coll.length);
				model.once("change:id", function(event) {
					console.log("model change:id EVENT. responding with 201.");
					res.send(201, model);
				})
				model.save();//save automatically on creation?
			} else {
				//model is invalid! respond with error..delete model
				console.log("new model is invalid. sorry.", model.validationError);
				return res.send(400, {message:"the new model did not validate and was not created. Error:"+model.validationError});
				model.destroy();
			}
			
		});
		
		//create the delete route
		this.app.delete(temp.urlRoot+"/:id", function(req, res){
			var modelName = req.url.split("/")[1];
			var id = req.params.id;
			console.log("attempting to delete:", modelName, "with id:", id );
			var coll = self.collections[modelName];
			if(coll == undefined) {
				//no collection exists!
				return res.json(404, {message:"the '"+ modelName + "' collection doesn't exist."});
			} else {
				var model = coll.get(id);
				if(model !== undefined) {
					//coll.remove(id);
					//model.off();
					model.once("destroy", function() {
						//the model has officually been deleted, respond
						return res.json(204);
					});
					model.destroy();//deletes from mongo, triggers a 'remove' event.
				} else {
					return res.json(404, {message:"the item with the id '"+id+"' doesn't exist in the collection '"+modelName+"'."});
				}
			}
		});
		
	}
	//finally, restore from mongo
	this.restoreFromMongo()
};

//this may go away, in favor of restoring on demand.
b2b.restoreFromMongo = function() {
	//get all of our collections from mongo and restore!
	for(var i in this.modelTemplates) {
		//create an object to handle restoring each collection
		var waiter = {};//
		waiter.b2b = this;
		waiter.name = i;
		waiter.model = this.mongooseModels[i];
		waiter.modelTemplate = this.modelTemplates[i];
		waiter.restore = function() {
			console.log("attempting to restore:", this.name, "from mongo..")
			var self = this;//ref to waiter?
			this.model.find({}, function(err, data){
				if(err === null) {
					//done!
					console.log("done restoring:", self.name, data);
					
					var coll = self.b2b.collections[self.name];
					//check for collection first!
					if (coll === undefined) {
						//create collection if it doesn't exist
						coll = self.b2b.collections[self.name] = new Backbone.Collection();
						coll.model = self.modelTemplate;
					}
					coll.set(data, {silent:true});//does this help supress sets?
				} else {
					console.log("error restoring from mongo!", err);
				}
			});
		};
		waiter.restore();
	}
};
exports = module.exports = Back2Backbone;