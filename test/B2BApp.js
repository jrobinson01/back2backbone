b2b = require("../back2backbone.js");

//create a config object
var config = {
	port:"3001",
	dbHost:"localhost",
	dbName:"blogEngine"
};
//start the app
var myb2bApp = new b2b(config);

var myModels = {};//table to store your models

//create your models
var User = myb2bApp.Model.extend({
	
	urlRoot:"/users",
	defaults:{
		name:"",
		email:"",
		blogs:function() {
			return this.urlRoot+"/"+this.get("id")+"/blogs";
		}
	},
	//override set to inject additional functionality
	set:function(key, val, options) {
		console.log("myApp: set called: key:",key, "value:", val);
		//custom logic here (invoke other services, etc. can be async (I think!).)
		//...
		//when done, call _super. (this will also call save)
		return this._super(key, val, options);
	},
	
	//define validate
	//return false if the change IS valid.
	//otherwise return an error string.
	validate:function(attrs, options) {
		console.log("myApp: validate called:", attrs.name, options);
		if(attrs.name == "joe") {//ignore anyone named joe :)
			console.log("User validation failed. returning error.", attrs.name)
			return "name cannot be 'joe'";
		}
		console.log("User validation passed! returning false.");
		return false;
	}
});

var Blog = myb2bApp.Model.extend({
	
	urlRoot:"/blogs",
	
	defaults:{
		name:"",
		posts:function() {
			return this.urlRoot+"/"+this.get("id")+"/posts";
		}
	}
});

var Post = myb2bApp.Model.extend({
	urlRoot:"/posts",
	
	defaults:{
		created:new Date().getTime(),
		message:"",
		displayName:""
	}
});

//store in an object
myModels["users"] = User;
myModels["blogs"] = Blog;
myModels["posts"] = Post;

//listen for b2b to create new models
myb2bApp.on("users:create", function(event) {
	console.log("APP got users:created event!", event);
});

myb2bApp.on("users:creation_failed", function(event) {
	console.log("APP got users:creation_failed event!", event);
});
//create routes for models, returns an array of collections(?)
myb2bApp.createRoutes(myModels);

//	once this is done, your models and collections are tied to a mongoose model.
//	define '_validate' functions on your models.
//	when model.set is called, the default behaviour is
//	for the model to automatically save to the db (IF validation passes)
//	override set to perform custom logic before saving (AND returning a response to the client?)
// example:
/*
myModel.on("change:email", function(event) {
	if(this.validate()) {
		this.save();//triggers a save to the db, and responds to the client
	} else {
		this.error("invalid email format");//ignores the db save and responds to the client with the error message.
	}
}
*/
