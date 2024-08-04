const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { listingSchema } = require("../schema.js");
const Review = require("./review.js");

const listSchema = new Schema({
    title:{
        type : String,
        required : true,
    },
    description : String,
    image:{
        url:String,
        filename:String,
    },
    
    price : Number,
    location : String,
    country : String,
    review :[
        {
            type:Schema.Types.ObjectId,
            ref:"Review"
        }
    ],
    owner: {
        type : Schema.Types.ObjectId,
        ref:"User",
    },
});

listSchema.post("findOneAndDelete", async(listing)=>{
    if(listing){
        await Review.deleteMany({_id : {$in : listing.review}})
    }
});

const Listing = mongoose.model("Listing", listSchema);
module.exports = Listing;