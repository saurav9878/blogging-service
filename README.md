# Blogging system

# Problem

Build a serverless blogging platform using AWS services. The platform should allow users to create, read, update, and delete blog posts. Additionally, users should be able to upload images to accompany their posts.

# Functional requirements

1. Back-end API:
a. Implement a RESTful API using AWS Lambda and API Gateway to handle
CRUD operations for blog posts.
b. Create endpoints for creating, reading, updating, and deleting blog posts.
c. Ensure that the API follows best practices for security, including authentication
and authorization mechanisms.
2. Database Integration:
a. Choose an appropriate AWS database service (RDS or DynamoDB) for storing
blog post data.
b. Design the database schema to store blog post content, metadata, and user
information.
c. Implement functions to interact with the database for storing and retrieving blog
posts.
3. File Storage:
a. Integrate AWS S3 for storing images uploaded by users to accompany their blog
posts.
b. Implement functionality to allow users to upload images and associate them with
their blog posts.
c. Ensure that uploaded images are securely stored and accessible only to
authorised users.

# Non-functional requirements

● Scalability: Design the architecture to scale efficiently as the platform grows in users
and content.
● Performance: Optimize the API and database queries for performance to ensure fast
response times.
● Security: Implement security best practices to protect user data and prevent
unauthorized access.
● Cost-Effectiveness: Consider cost-effective solutions when choosing AWS services and
optimizing resource usage.

# API Design

1. POST /users/signup → Sign up a user
2. POST /users/login → Login a user
3. PUT /posts → create or update a post
4. GET /posts/{id} → Get a blog post
5. GET /posts → Get all blog posts
6. DELETE /posts/{id} → Delete a blog post

### POST /users/signup → Sign up a user

Input → 

```jsx
{
	"email" :"test@gmail.com",
	"password": "password"
}
```

output →

```jsx
statusCode: 200 -> success, 400 -> client side input error
```

### POST /users/login → Login a user

Input → 

```jsx
{
	"email" :"test@gmail.com",
	"password": "password"
}
```

output →

```jsx
statusCode: 200 -> success, 400 -> client side input error, 403 -> wrong pass

{
	"token" :"<jwt_token"
}
```

### PUT /posts → create or update a post

Input →

```jsx
// multipart/form-data

image : dog.png (file attached)
message: "Hello there!"
id: "bb655561-7487-4adb-aac0-d172705269b9" (id is optional, if missing,
 will create a new post)

// Authorization header
Authorization: Bearer <jwt_token>
```

output → 

```jsx
status: 200 -> success, 400 -> bad request, 403 -> bad token
```

### GET /posts/{id} → Get a blog post

output →

```jsx
{
    "id": "7369904c-44aa-4d89-98a2-b3c544f38b06",
    "message": "Hello world!"
}
```

### GET /posts → Get all blog posts

output →

```jsx
[{
    "id": "7369904c-44aa-4d89-98a2-b3c544f38b06",
    "message": "Hello world!"
},

 {
        "message": "image wala post again 7",
        "imageUrl": "https://blog-march.s3.ap-south-1.amazonaws.com/images/test@gmail.com/1709829272179.jpg",
        "id": "ee5b640e-dbb5-4440-a195-e3bf389e63fb",
        "email": "test@gmail.com"
    }
 [
```

### DELETE /posts/{id} → Delete a blog post

Input → 

```jsx
//Authorization header
Authorization: Bearer <jwt_token>
```

Output→

```jsx
200 -> success, 400 -> bad request, 403 -> bad token
```

# Exploration

## REST APIs in AWS Lambda

To build an API with Lambda integrations, one can use Lambda proxy integration or Lambda non-proxy integration.

- Lambda proxy - API Gateway configures the integration request and integration response for you.
- Lambda non-proxy - In Lambda non-proxy integration, you must ensure that input to the Lambda function is supplied as the integration request payload.

So, will choose to proceed with lambda proxy for its easy connection to lambda proxy. Easier config, scalability, performance will be offered out of the box.

### **Cost analysis**

- [Cost with scale in number of requests](https://aws.amazon.com/lambda/pricing/)

[![Screenshot-from-2024-03-06-12-40-07.png](https://i.postimg.cc/8CQWZ7qs/Screenshot-from-2024-03-06-12-40-07.png)](https://postimg.cc/3k1dRxrH)

- Cost with duration (lambda run time)

[![Untitled.png](https://i.postimg.cc/zvZGrhFR/Untitled.png)](https://postimg.cc/tZkjdYfX)

- Cost with ephemeral storage

	**$0.0000000352 for every GB-second**

### Configuration

- Let’s start with the minimal provisioned resources across tiers and we’ll adapt to the scale as and when needed. i.e. 518 MB ephemeral storage, 128MB memory
- Default timeout for the lambda is 3 seconds, if the API request takes longer than that, increase it accordingly.
- Lambda functions always run inside VPCs owned by the Lambda service. As with customer-owned VPCs, this allows the service to apply network access and security rules to everything within the VPC. These VPCs are not visible to customers, the configurations are maintained automatically, and monitoring is managed by the service. So, no need to configure a VPC.

## API Gateway

To expose the lambda to the outside world, one may use AWS API gateway to configure REST endpoints for the API.

### Pricing

[![Untitled-1.png](https://i.postimg.cc/pdmW5C0F/Untitled-1.png)](https://postimg.cc/WDPLQGcN)

### Configuration

- The request validation model is attached for json requests. This may be extended to multipart/form-data (not explored yet).
- For testing, one can create a sandbox `stage`, apart from actual production.
- For sending images along with blog post message, we may have to use multipart/form-data as request body. So, API gateway need to be configured accordingly.

[![Untitled-2.png](https://i.postimg.cc/cLbZWYs4/Untitled-2.png)](https://postimg.cc/mPCKNPz0)

### QPS limits

API Gateway has account-level quotas, per Region. The throttle quota is **10,000 requests per second (RPS)** with an additional burst capacity provided by the token bucket algorithm. The maximum bucket capacity is 5,000 requests per account and Region

## Database

We’ve two choices with Lambda - NoSQL vs MySQL

- NoSQL is cheaper and scales well horizontally compared to SQL, so will that.
- DynamoDB is a [true serverless non-relational database](https://aws.amazon.com/dynamodb/pricing/). Compared to other databases that charge on various metrics, like storage, DynamoDB can scale-to-zero, meaning when customers utilize on-demand mode they only pay for active resources consumed.

**So, we’ll choose to proceed with DynamoDB**

### DynamoDB configuration

- Set the capacity of dynamoDB from `provisioned` to `on-demand`
- Configure lambda to CRUD table entries in dynamoDB - [https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/iam-policy-example-data-crud.html](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/iam-policy-example-data-crud.html)
- Set backup policy for DB
- Enable `delete protection` in DB

## S3

To store images in S3, we need to configure a private S3 bucket who objects may be public so that users can access their posts but won’t be able to list entities in the bucket.

### Configuration

- Turn off Block all public access
- Edit object ownership to enable ACL so that we can set ACL of objects from the lambda.

[![Untitled-3.png](https://i.postimg.cc/VLk3N6ZS/Untitled-3.png)](https://postimg.cc/3WzLSKT7)

# Potential Improvements

- Currently, image has no size limit requirements. One may add that to avoid failure of memory overflow.
- Think about a case when multiple image loaded into memory can overflow if there are too many requests.
- Move environment variables like `PASSWORD_SECRET`, `JWT_SECRET` to secrets manager.
- One may use [AWS WAF](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-aws-waf.html) (web application firewall) along with AWS API gateway to secure the REST APIs against common web exploits such as SQL injection, XSS attacks. Cloudflare may need to be configured to enable WAF.
- Customize [throttling limit](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html#apigateway-how-throttling-limits-are-applied) for API gateway to manage rate limit at the infra layer.
- May use provisioned currency in lambda to reduce cold start time if needed.
- To prevent unexpected billing, one may configure [api gateway to stop incoming requests and throttle lambda to zero](https://harishkm.in/2020/07/10/automatically-shutdown-your-api-on-amazon-api-gateway-when-it-breaches-a-certain-spending-threshold/) by creating a budget and trigger.
- Error/success messages for API can be improved, currently it’s just functional.
