b2b = require("../../back2backbone.js");

//create a config object
var config = {
	port:"3001",
	dbHost:"localhost",
	dbName:"mydb"
};
//start the app
var myb2bApp = new b2b(config);

var myModels = {};//table to store your models

var User = myb2bApp.Model.extend({
	
	urlRoot:"/users",
	defaults:{
		name:"",
		email:"",
		blogs:"",//link/reference to our blogs
	},
	//override set to inject additional functionality
	set:function(key, val, options) {
		
		console.log("myApp: set called");
		//custom logic here (invoke other services, etc. can be async. The server will not respond to the client until this._super() is called.)
		//...
		this._super(key, val, options);
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
		posts:""//*should* be a reference to our posts
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

//create routes for your models
myb2bApp.createRoutes(myModels);

