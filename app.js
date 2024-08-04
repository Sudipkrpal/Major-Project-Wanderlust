const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema, reviewSchema } = require("./schema.js");
const Review = require("./models/review.js");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const {isLoggedIn, saveRedirectUrl, isOwner, isReviewAuthor} = require("./middleware.js");
const multer  = require('multer');
const {storage} = require("./cloudConfig.js");
const upload = multer({storage});
require('dotenv').config();
/* if(process.env.NODE_ENV != "production"){
  require('dotenv').config();
} */

/* let mongoUrl = "mongodb://127.0.0.1:27017/wanderlust"; */
const dbUrl = process.env.ATLASDB_URL;
main()
  .then((res) => {
    console.log("DB connection successfull");
  })
  .catch((err) => console.log(err));

async function main() {
  await mongoose.connect(dbUrl);
}
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const store = MongoStore.create({
  mongoUrl:dbUrl,
  crypto:{
    secret:process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});

store.on("error",()=>{
  console.log("error in MONGO session",err);
});

const sessionOptions = {
  store,
  secret:process.env.SECRET, // implementing session
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

/* app.get("/", (req, res) => {
  res.send("working");
}); */

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;  // because we can't use req.use directly in ejs.
  next();
});

/* app.get("/demouser", async(req,res)=>{
  let fakeUser = new User({
    email:"sample123@gmail.com",
    username: "Sample-demo"
  });
  let registeredUser = await User.register(fakeUser,"helloworld");
  res.send(registeredUser);
}) */

const validateReview = (req, res, next) => {
  let { error } = reviewSchema.validate(req.body);
  if (error) {
    let errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};
// index route
app.get("/listings", async (req, res) => {
  try {
    let allListings = await Listing.find({});
    res.render("listings/index.ejs", { allListings });
  } catch (err) {
    next(err);
  }
});

// new route
app.get("/listings/new",isLoggedIn, (req, res) => {
  res.render("listings/new.ejs");
});
// show route
app.get("/listings/:id", async (req, res, next) => {
  try {
    let { id } = req.params;
    let listing = await Listing.findById(id).populate({path : "review", populate:{path:"author"},}).populate("owner");
    if (!listing) {
      req.flash("error", "Listing you requested for does not exist!");
      res.redirect("/listings");
    }
    res.render("listings/show.ejs", { listing });
  } catch (err) {
    next(err);
  }
});

// create route
app.post("/listings", isLoggedIn, upload.single("listing[image]"), async (req, res, next) => {
  try {
    let result = listingSchema.validate(req.body); //validation for schema using joi api
    console.log(result);
    if (result.error) {
      throw new ExpressError(400, result.error);
    }
    let url = req.file.path;
    let filename = req.file.filename;
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    newListing.image ={url, filename};
    await newListing.save();
    req.flash("success", "New listing created");
    res.redirect("/listings");
  } catch (err) {
    next(err);
  }
});

// edit route
app.get("/listings/:id/edit", isLoggedIn, isOwner, async (req, res, next) => {
  try {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    if (!listing) {
      req.flash("error", "Listing you requested for does not exist!");
      res.redirect("/listings");
    }
    let originaImagelUrl = listing.image.url;
    originaImagelUrl = originaImagelUrl.replace("/upload", "/upload/w_250");
    res.render("listings/edit.ejs", { listing, originaImagelUrl });
  } catch (err) {
    next(err);
  }
});

// update route
app.put("/listings/:id", isLoggedIn, isOwner, upload.single("listing[image]"), async (req, res, next) => {
  try {
    if (!req.body.listing) {
      throw new ExpressError(400, "Send valid data for listing");
    }
    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing }); //deconstructing req.body to update data

    if(typeof req.file !== "undefined"){
      let url = req.file.path;
      let filename = req.file.filename;
      listing.image = {url, filename};
      await listing.save();
    }
    req.flash("success", "Listing updated");
    res.redirect(`/listings/${id}`); // it will redirect to show.ejs/id
  } catch (err) {
    next(err);
  }
});

// delete route
app.delete("/listings/:id", isLoggedIn, isOwner, async (req, res, next) => {
  try {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success", "Listing deleted");
    res.redirect("/listings");
  } catch (err) {
    next(err);
  }
});

// review
//post route
app.post("/listings/:id/reviews", isLoggedIn, validateReview, async (req, res, next) => {
  try {
    let listing = await Listing.findById(req.params.id);
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    listing.review.push(newReview);

    await newReview.save();
    await listing.save();

    req.flash("success", "New rewiew created");
    res.redirect(`/listings/${listing._id}`);
  } catch (err) {
    next(err);
  }
});

//delete review route
app.delete("/listings/:id/reviews/:reviewId", isLoggedIn, isReviewAuthor, async (req, res, next) => {
  try {
    let { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { review: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review deleted");
    res.redirect(`/listings/${id}`);
  } catch (err) {
    next(err);
  }
});

// signUp route
app.get("/signup", (req, res) => {
  res.render("users/signup.ejs");
});

app.post("/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;
    const newUser = new User({ email, username });
    const registeredUser = await User.register(newUser, password);
    console.log(registeredUser);
    req.login(registeredUser,(err)=>{
      if(err){
        return next();
      };
      req.flash("success", `Welcome ${username} to Wanderlust`);
      res.redirect("/listings");
    });
 
  } catch (e) {
    req.flash("error", e.message);
    res.redirect("/signup");
  }
});

// login route
app.get("/login", (req, res) => {
  res.render("users/login.ejs");
});
app.post("/login", saveRedirectUrl, passport.authenticate('local', { failureRedirect: '/login',failureFlash:true }), async (req,res)=>{
  let{username}=req.body
  req.flash("success", `Hi, ${username} welcome back to Wanderlust!`);
  let redirectUrl = res.locals.redirectUrl || "/listings";
  res.redirect(redirectUrl);
});

// logout route
app.get("/logout", (req,res,next)=>{
  req.logout((err)=>{
    if(err){
      return next(err);
    }
    req.flash("success","You are logged out!");
    res.redirect("/listings");
  });
});
/* app.get("/testlisting",async(req,res)=>{
    let sampleLsting = new Listing({
        title : "New destination",
        description : "Beach side",
        price : 1200,
        location : "Goa",
        country : "India"
    });
    await sampleLsting.save();
    console.log("sample data saved");
    res.send("successfull testing");
}); */
app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found!"));
});
app.use((err, req, res, next) => {
  // error handling middleware
  let { statusCode = 500, message = "something went wrong" } = err;
  res.status(statusCode).render("listings/error.ejs", { message }); // to sent error.ejs template
  //res.status(statusCode).send(message);
});
app.listen(8080, () => {
  console.log("listening to port 8080");
});
