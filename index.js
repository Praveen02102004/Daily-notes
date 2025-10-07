import express from "express";
import bodyParser from "body-parser";
import path from "path";
import  pg from "pg";
import session from 'express-session';
import bcrypt from 'bcrypt';
import passport from 'passport';
import env from "dotenv";
const saltRounds=10;

const app = express();
const port = 3000;

env.config();

app.use(express.urlencoded({ extended: true }));
app.use(express.static(process.cwd()));
app.use(
  session({
    secret: process.env.secret, 
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 3 * 60 * 60 * 1000, 
      secure: false, 
      httpOnly: true, 
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.set("views", path.join(process.cwd(), "views"));
app.set("view engine", "ejs");


app.use(express.static(path.join(process.cwd(), "public")));

const db=new pg.Client({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: process.env.port,
});
db.connect();


async function topic_list(req){
    try{
    const userId=req.session.uid;
    if(!userId){
        return res.redirect("/login")
    }
    const list=await db.query('select * from topics where user_id=$1',[userId]);
    const allrows=list.rows;
    return allrows;
    }
    catch(err){
        console.log(err);
        throw err;
    }

}

app.get("/", (req, res) => {
    res.render("index");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/register", (req,res)=>{ 
    res.render("register");
});


app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Error during logout: ", err);
      return res.status(500).send("Internal Server Error");
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session: ", err);
      }
      res.clearCookie("connect.sid"); 
      res.redirect("/"); 
    });
  });
});

app.get("/content", async (req, res) => {
    try {
        const userId = req.session.uid;
        const tid = req.session.tid;

        if (!userId || !tid) {
            return res.redirect("/login");
        }
        
        const title=await db.query("SELECT topic FROM topics WHERE user_id = $1 AND topic_id = $2",
            [userId, tid]);

        req.session.tid = tid;

        const note = await db.query(
            "SELECT note FROM notes WHERE user_id = $1 AND topic_id = $2",
            [userId, tid]
        );

        const content = note.rows.length > 0 ? note.rows[0].note : "Write something";

        res.render("content", { 
            title: title.rows[0].topic,
            content: content });
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
});
app.get("/topic",async(req,res)=>{
    try{
    let topics= await topic_list(req);
    res.render("topic", {topics});
    }
    catch(err){
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
    
});

app.post('/add', async(req,res)=>{
    const item=req.body.newItem
    try{
        const userId=req.session.uid;
        if(!userId){
            return res.redirect("/login");
        }
        console.log("Your Item is " +item.length+ " :");
        if(item.length>0){
        console.log(userId);
        await db.query('insert into topics (user_id,topic) values ($1,$2)',[userId,item]);
        res.redirect("/topic");
        }
        else{
            res.redirect("/topic");
        }


    }catch(err){
        console.log(err);
    }
})


app.post('/register', async(req,res)=>{
    const email=req.body.username;
    const password=req.body.password;
    try{
        const checkUser=await db.query("select * from users where email= $1",[email]);
        if(checkUser.rows.length>0){
            res.send("Email already exists. Try logging in");
        }
        else{
            bcrypt.hash(password,saltRounds,async(err,hash)=>{
                if(err){
                    console.log(err);
                }
                else{
                    const result=await db.query('insert into users (email,password) values($1,$2) returning id',[email,hash]);
                    req.session.uid=result.rows[0].id;
                    res.redirect("/topic");
                }
            })
        }
    }
    catch(err){
        console.log(err);
    }
});

app.post("/login", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;

    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedPassword = user.password;

            // Comparing passwords using bcrypt
            const isMatch = await bcrypt.compare(password, storedPassword);

            if (isMatch) {
                req.session.uid = user.id; 
                return res.redirect("/topic");
            } else {
                return res.status(401).send("Incorrect Password");
            }
        } else {
            return res.status(404).send("User not found");
        }
    } catch (err) {
        console.error("Error during login: ", err);
        return res.status(500).send("Internal Server Error");
    }
});



app.post('/content', async (req, res) => {
    const topicId = req.body.tid;
    const userId = req.session.uid;

    try {
        if (!userId) {
            return res.redirect("/login");
        }

        req.session.tid = topicId;

        const check = await db.query(
            "SELECT * FROM notes WHERE user_id = $1 AND topic_id = $2",
            [userId, topicId]
        );

        if (check.rows.length === 0) {
            await db.query(
                "INSERT INTO notes (user_id, topic_id) VALUES ($1, $2)",
                [userId, topicId]
            );
        }
        res.redirect("/content");
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/update", async(req,res)=>{
    try{
        const content=req.body.content;
        const userId = req.session.uid;
        const tid=req.session.tid;
        console.log("Updtaing")
        await db.query("update notes set note= $1 where user_id=$2 and topic_id=$3 ",[content,userId,tid]);
        res.redirect("/content");
    }
    catch(err){
        console.log(err);
    }
})

passport.serializeUser((user, cb) => {
  cb(null, user.id); 
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length > 0) {
      cb(null, result.rows[0]); 
    } else {
      cb(new Error("User not found"));
    }
  } catch (err) {
    cb(err);
  }
});

app.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session: ", err);
      }
      res.clearCookie("connect.sid"); 
      res.redirect("/login");
    });
  });
});

app.get("/create", (req, res) => {
    if (req.session.uid) {
        return res.redirect("/topic");
    } else {
        return res.redirect("/login");
    }
});

app.post("/delete-topic", async (req, res) => {
  const topicId = req.body.tid;
  const userId = req.session.uid;

  try {
    if (!userId) {
      return res.redirect("/login");
    }

    await db.query("DELETE FROM topics WHERE topic_id = $1 AND user_id = $2", [topicId, userId]);

    res.redirect("/topic"); 
  } catch (err) {
    console.error("Error deleting topic: ", err);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, () => {
    console.log(`Your server is running on port ${port}`);
});