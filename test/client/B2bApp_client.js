var User = Backbone.Model.extend({
	urlRoot:"http://localhost:3001/users",
	defaults:{
		name:"",
		email:""
	}
});

var testUser = new User({name:"bob deleter", email:"wellwat@wat.com"});
testUser.on("all", function(){
	console.log("testUser event:", arguments);
});
testUser.save();//test providing callbacks in options obj here?