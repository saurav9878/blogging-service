import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID, createHash } from "crypto";
import aws from "aws-sdk";
import multipart from 'aws-lambda-multipart-parser';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";

const client = new DynamoDBClient({});

const dynamo = DynamoDBDocumentClient.from(client);


const bucket = "blog-march";

const region = 'ap-south-1';

const USER_TABLE_NAME = "users";

const POST_TABLE_NAME = "posts";

const s3 = new aws.S3({ apiVersion: "2006-03-01" });

const uploadImageToS3 = async (image, email) => {
  const key = Date.now();
  const extension = image.filename.split(".")[1];
  const filename = `${key}.${extension}`;

  const params = {
    Bucket: bucket + "/images/" + email,
    Key: filename,
    Body: image.content,
    ContentType: image.contentType,
    ACL: 'public-read'
  };
  try {
    await s3.putObject(params).promise();
    const imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/images/${email}/${filename}`
    return imageUrl;
} catch (err) {
    console.log(JSON.stringify(err))
    throw new Error(err);
  }
};

const verifyToken = async (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET_KEY, function (err, decoded) {
      if (err) {
        return reject(err);
      }
      return resolve(decoded.email);
    });
  });
};

const checkWhetherUserOwnsThePost = async (email, id) => {
  let post = await dynamo.send(
    new GetCommand({
      TableName: POST_TABLE_NAME,
      Key: {
        id,
      },
    })
  );
  post = post.Item;

  if (post.email !== email) {
    throw new Error("unauthorized action");
  }
  return true;
};

const handlePostEvent = async (event, routeKey) => {
  let body, id, authToken, email, message, payload;

  switch (routeKey) {
    case "DELETE /posts/{id}":
      id = event.pathParameters.id;
      authToken = event.headers.Authorization;
      authToken = authToken.split(" ")[1];
      email = await verifyToken(authToken);

      await checkWhetherUserOwnsThePost(email, id);
      await dynamo.send(
        new DeleteCommand({
          TableName: POST_TABLE_NAME,
          Key: {
            id: event.pathParameters.id,
          },
        })
      );
      body = `Deleted item ${event.pathParameters.id}`;
      break;

    case "GET /posts/{id}":
      body = await dynamo.send(
        new GetCommand({
          TableName: POST_TABLE_NAME,
          Key: {
            id: event.pathParameters.id,
          },
        })
      );
      body = body.Item;
      break;

    case "GET /posts":
      body = await dynamo.send(new ScanCommand({ TableName: POST_TABLE_NAME }));
      body = body.Items;
      break;

    case "PUT /posts":
      authToken = event.headers.Authorization;
      authToken = authToken.split(" ")[1];
      email = await verifyToken(authToken);
      event.body = Buffer.from(event.body, 'base64').toString();
      const formData = multipart.parse(event, true);
      
      if(formData.id && !formData.message && !formData.image){
        throw new Error('Missing content to update in the post')
      }

      const image = formData.image;
      message = formData.message;

      id = formData.id || randomUUID();
      let imageUrl;
      if (image) {
        imageUrl = await uploadImageToS3(image, email);
      }
      if (formData.id) {
        await checkWhetherUserOwnsThePost(email, id);
      }

      await dynamo.send(
        new PutCommand({
          TableName: POST_TABLE_NAME,
          Item: {
            id,
            message,
            email,
            imageUrl,
          },
        })
      );

      body = `Put item ${id}`;
      break;
    default:
      throw new Error(`Unsupported route: "${JSON.stringify(event)}"`);
  }

  return body;
};

const handleUserEvent = async (event, routeKey) => {
  let body;
  let { email, password } = JSON.parse(event.body);

  password = createHash("sha256", process.env.PASSWORD_HASH_SECRET)
    .update(password)
    .digest("hex");

  switch (routeKey) {
    case "POST /users/signup":
      body = await dynamo.send(
        new PutCommand({
          TableName: USER_TABLE_NAME,
          Item: {
            email,
            password,
          },
        })
      );
      body = "success";
      break;
    case "POST /users/login":
      body = await dynamo.send(
        new GetCommand({
          TableName: USER_TABLE_NAME,
          Key: {
            email,
          },
        })
      );

      if (body.Item.password === password) {
        // authenticated
        // generate token
        const token = jwt.sign({ email }, process.env.JWT_SECRET_KEY);
        body = { token };
      } else {
        throw new Error("authentication_error");
      }

      break;

    default:
      throw new Error(`Unsupported route: "${JSON.stringify(event)}"`);
  }

  return body;
};

export const handler = async (event, context) => {
  let body,
    statusCode = 200;
  const headers = {
    "Content-Type": "application/json",
  };

  try {
    const routeKey = `${event.httpMethod} ${event.resource}`;

    if (routeKey.includes("posts")) {
      body = await handlePostEvent(event, routeKey);
    } else if (routeKey.includes("user")) {
      body = await handleUserEvent(event, routeKey);
    } else {
      throw new Error(`Unsupported route: "${JSON.stringify(event)}"`);
    }
  } catch (err) {
    statusCode = 400;
    console.log("error occurred", err);
    if (err.message === "authentication_error") {
      statusCode = 403;
    }

    body = JSON.stringify(err);
  } finally {
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
    headers,
  };
};
