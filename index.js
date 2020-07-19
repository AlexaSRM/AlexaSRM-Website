const express = require("express");
const app = express();
const mime = require("mime-types");
const fs = require("fs");
const path = require("path");
const jimp = require("jimp");
const joi = require("@hapi/joi");
const { MongoClient } = require("mongodb");
const stream = require("stream");

(async function () {
  require("dotenv").config();
  const hostname = "localhost";
  const port = process.env.PORT || 3000;
  const uri = process.env.DB_CONN;
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  app.use(express.urlencoded());
  app.use(express.static(__dirname + "/public"));

  try {
    await client.connect();
  } catch (err) {
    console.error(err);
  } finally {
    console.log("Connected to db");
  }

  app.all("/", (req, res, next) => {
    res.redirect("./events.html");
  });

  app.post("/generateCertificate", async (req, res, next) => {
    try {
      var getObj = {
        userEmail: req.body.user.email,
      };
      var checkedEmail = await validateEmail(getObj);
      if (!checkedEmail) {
        res.statusCode = 422;
        res.send("Invalid Email Address");
        res.end();
      } else {
        var participantName = await findOneListingByEmail(client, checkedEmail);
        if (participantName) {
          var certImage = await createCertificate(participantName);
          const fileName = "Upskill-certificate.png";
          var file = Buffer.from(certImage, "base64");
          const mimeType = mime.lookup(file);
          var readStream = new stream.PassThrough();
          readStream.end(file);
          res.writeHead(200, {
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Content-Type": mimeType,
          });
          readStream.pipe(res);
        } else {
          res.statusCode = 404;
          res.send("Certificate not available");
          res.end();
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  app.listen(port, hostname, () => {
    console.log(`listening on http://${hostname}:${port}`);
  });
})();

async function validateEmail(getObj) {
  try {
    const schema = joi.object({
      userEmail: joi.string().email(),
    });
    const value = await schema.validateAsync(getObj);
    if (value.userEmail) {
      return value.userEmail;
    } else {
      return;
    }
  } catch (err) {
    console.log(err);
  }
}

async function findOneListingByEmail(client, userEmail) {
  try {
    const cursor = await client
      .db()
      .collection("events")
      .aggregate(
        {
          $match: {
            id: "upskill_attendance",
            "presentRegistrants.Email": userEmail,
          },
        },
        { $unwind: "$presentRegistrants" },
        {
          $match: {
            "presentRegistrants.Email": userEmail,
          },
        },
        { "presentRegistrants.$": 1 }
      )
      .toArray();
    if (!cursor || cursor.length < 1) {
      return;
    }
    var obj = cursor[0].presentRegistrants;
    if (obj.Name) {
      return obj.Name;
    } else {
      return;
    }
  } catch (err) {
    console.log(err);
  }
}

async function createCertificate(participantName) {
  const certPath = path.join(
    __dirname,
    "/public/res/img/certificates/upskill.png"
  );
  const fontPath = path.join(__dirname, "/public/res/fonts/alexa-font.fnt");
  try {
    const cert = await jimp.read(certPath);
    const font = await jimp.loadFont(jimp.FONT_SANS_128_BLACK);
    cert.print(font, 1350, 1200, participantName);
    const certImage = await cert.getBufferAsync(jimp.MIME_PNG);
    return certImage;
  } catch (err) {
    console.error(err);
  }
}
