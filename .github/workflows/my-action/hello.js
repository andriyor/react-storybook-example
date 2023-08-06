const core = require('@actions/core');
const S3 = require('aws-sdk/clients/s3');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const slash = require('slash');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');

const AWS_KEY_ID = core.getInput('aws_key_id', {
    required: true,
});
const SECRET_ACCESS_KEY = core.getInput('aws_secret_access_key', {
    required: true,
});
const BUCKET = core.getInput('aws_bucket', {
    required: true,
});
const SOURCE_DIR = core.getInput('source_dir', {
    required: true,
});
const DESTINATION_DIR = core.getInput('destination_dir', {
    required: false,
});
const ENDPOINT = core.getInput('endpoint', {
    required: false,
});

const gh_token = core.getInput('gh_token');

const s3options = {
    accessKeyId: AWS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
};

if (ENDPOINT) {
    s3options.endpoint = ENDPOINT;
}


const context = github.context;
if (context.payload.pull_request) {
    const pull_request_number = context.payload.pull_request.number;

    const octokit = new github.GitHub(gh_token);
    octokit.issues.createComment({
        ...context.repo,
        issue_number: pull_request_number,
        body: 'message'
    });
}

const s3 = new S3(s3options);
const destinationDir = DESTINATION_DIR === '/' ? shortid() : DESTINATION_DIR;
const paths = klawSync(SOURCE_DIR, {
    nodir: true,
});

function upload(params) {
    return new Promise((resolve) => {
        s3.upload(params, (err, data) => {
            if (err) core.error(err);
            core.info(`uploaded - ${data.Key}`);
            core.info(`located - ${data.Location}`);
            resolve(data.Location);
        });
    });
}

function run() {
    const sourceDir = slash(path.join(process.cwd(), SOURCE_DIR));
    return Promise.all(
        paths.map((p) => {
            const fileStream = fs.createReadStream(p.path);
            const bucketPath = slash(
                path.join(destinationDir, slash(path.relative(sourceDir, p.path)))
            );
            const params = {
                Bucket: BUCKET,
                ACL: 'public-read',
                Body: fileStream,
                Key: bucketPath,
                ContentType: lookup(p.path) || 'text/plain',
            };
            return upload(params);
        })
    );
}

run()
    .then((locations) => {
        core.info(`object key - ${destinationDir}`);
        core.info(`object locations - ${locations}`);
        core.setOutput('object_key', destinationDir);
        core.setOutput('object_locations', locations);
    })
    .catch((err) => {
        core.error(err);
        core.setFailed(err.message);
    });
