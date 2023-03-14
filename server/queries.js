const { exec } = require("child_process");
var fs = require('fs') ;
const cdb = require("./helpers");
const promise = require("bluebird");
const options = {
  promiseLib: promise,
};
const pgp = require("pg-promise")(options);
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const mime = require('mime');
const sharp = require("sharp");

const dbAuth = require("./dbAuth");
const authUser = require("../server/userAuth");
const uploadFile = require("../middleware/upload");
const decompress = require("decompress");
const { fail } = require("assert");

var nodemailer = require('nodemailer');

const PDFDocument = require('pdfkit');
const csv = require('csv-stringify');

const admindb = dbAuth.admin_db;
const idcarddb = dbAuth.idcard_db;
const companybase = dbAuth.company_base;
var companyDB = null;
var connectDB = null;
const authorized = true;
let current_userid = null;
let current_role = null;
let accessLevel  = 4;
let current_domain = null;
let current_Permission = dbAuth.permissions;
let current_programs = dbAuth.userprogram;
var skipPassword = true;

function getDatabaseAPIKey(req, res, next) {
  const idCardDB = pgp(idcarddb);
  const apiKey = req.body.api_key;

  idCardDB
    .any("SELECT app_database FROM applications WHERE api_key = ($1)", [apiKey])
    .then((data) => {
      req.body.db = data.app_database;
      next;
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data: err, message: "bad request" });
    });
}

function getDatabaseEmail(req, res, next) {
  const idCardDB = pgp(idcarddb);
  const email = req.body.email;
  let domain = email.substring(email.lastIndexOf("@") + 1);

  idCardDB
    .any("SELECT company_database FROM companies WHERE company_domain = ($1)", [
      domain,
    ])
    .then((data) => {
      req.body.db = data.company_database;
      next;
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data: err, message: "bad request" });
    });
}

function getcompanyList(req, res, next) {
  const adminDB = pgp(admindb);
  const idCardDB = pgp(idcarddb);
  const adminID = "";

  adminDB
    .any("SELECT enabled FROM admins WHERE admin_id = ($1)", [adminID])
    .then((data) => {
      if (data.enabled == true) {
        idCardDB.any("SELECT * FROM companies");
      } else {
        res
          .data(403)
          .json({ status: "error", data: err, message: "forbidden" });
      }
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data, err, message: "bad request" });
    });
}

// users
function createUser(req, res, next) {
  const email = req.body.user_email;
  const firstName = req.body.first_name;
  const lastName = req.body.last_name;
  const userRole = req.body.user_role;

  //get create date 
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  today = mm + '-' + dd + '-' + yyyy;

// Validate if the email match wirh the company database  
  const dbClient = cdb.getDomain(email);
  // if ((current_domain === dbClient ) || (userRole ==='Administrator')){
    connectDB = cdb.getDatabase(email);
  // Check condition to insert user
  // Access level 1: Admin - Can Create all users
  // Access level 2: Program Manager - Can Create all users not Aministrator
  // Access level 3: User - Can Create all users only Card Holder

    let allow = authUser.checkClientRole(userRole,accessLevel);
    const userPermissions = JSON.stringify(req.body.user_permissions);
    const userPrograms = JSON.stringify(req.body.user_programs);
    const userStatus = req.body.user_status;
    const password = Math.random().toString(36).slice(-8);
    let roleNo = authUser.authRole(userRole);
    let card_edit = JSON.parse(userPermissions).cards_edit;
    let card_print = JSON.parse(userPermissions).cards_print;
    let card_reject = JSON.parse(userPermissions).cards_reject;
    let nfc_write = JSON.parse(userPermissions).nfc_write;
    let batch_loading = JSON.parse(userPermissions).batch_loading;
    let result = verifytoken(req, res, next);
    if(result ==='true'){
      if (allow){
        if (roleNo < 3 && batch_loading){
          res.status(401)
            .json({ status: "error", message: "This user is not have batch loading permission" });
        } else if (roleNo === 4 && (card_edit || card_print || card_reject || nfc_write || batch_loading)){   
          res.status(401)
            .json({ status: "error", message: "Card Holder is not have permissions: edit, print, reject, nfc write, or batch loading" });
        } else {
          connectDB.tx(async (t) => {
            const q1 = await t.any(
              "INSERT INTO users (email, first_name, last_name, user_role, user_status, user_permissions, user_programs, created_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING user_id",
              [email, firstName, lastName, userRole, userStatus, userPermissions, userPrograms, today]
            );
            const q2 = await t.any(
              "UPDATE user_passwords SET password = ($2) WHERE user_id = ($1)",
              [q1[0].user_id, password]
            );
            return t.batch([q1, q2]);
          })
            .then((data) => {
              let subject = 'Create new user and set the password';
              let title = "Create User";
              let content = '<center> <h2>Create New User</h2><br> <p>New user has created successfully.</p><br> <p>New Password : ' + password + '</p> <br><p>If you have any wrong, you can let know Admin.</p> <br/> <h4>Thanks for choosing Veritec.Inc website.</h4></center>'
              sendEmail(email, subject, title, content);
              res
                .status(200)
                .json({ status: "success", data: data[0], message: "user created" });
            })
            .catch((err) => {
              res
                .status(400)
                .json({ status: "error", data: err, message: "bad request" });
            });
          }
      } else{
        res.status(401)
          .json({ status: "error", message: 'Can not allow to create user role: ' + userRole.toString() })
      }
    } else {
      res.status(401)
        .json({ status: "error", message: "Not Allow" })
      // return res.send('Not Allow')
    }         
  // } else{
  //   res.status(401)
  //      .json({ status: "failed", message: "Email is not correct in the domain" })
  // }
}

function getUserByID(req, res, next) {
  if (accessLevel < 4){
  const userID = parseInt(req.params.id);
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    companyDB.any(`SELECT * FROM users WHERE user_id = ${userID} AND delete_flag = false`)
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get user success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else{
        res.status(401)
        return res.send('Not Allow')
  }
}

function updateUser(req, res, next) {
  const userID = parseInt(req.params.id);
  const firstName = req.body.first_name;
  const lastName = req.body.last_name;
  const userRole = req.body.user_role;
  const userStatus = req.body.user_status;
  const userPermissions = req.body.user_permissions;
  const userPrograms = req.body.user_programs;
  const domain = req.body.domain;
  let roleNo = authUser.authRole(userRole);
  let card_edit = userPermissions.cards_edit;
  let card_print = userPermissions.cards_print;
  let card_reject = userPermissions.cards_reject;
  let nfc_write = userPermissions.nfc_write;
  let batch_loading = userPermissions.batch_loading; 

  let sel_db = cdb.getDomainDB(domain);
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    let allow = authUser.checkClientRole(userRole,accessLevel);
    if(allow){
      if (roleNo < 3 && batch_loading){
        res.status(401)
          .json({ status: "error", message: "This user is not have batch loading permission" });
      } else if (roleNo === 4 && (card_edit || card_print || card_reject || nfc_write || batch_loading)){   
        res.status(401)
          .json({ status: "error", message: "Card Holder is not have permissions: edit, print, reject, nfc write, or batch loading" });
      } else {
        sel_db.any(
        "UPDATE users SET first_name = ($2), last_name = ($3), user_role = ($4), user_status =($5), user_permissions = ($6), user_programs = ($7)  WHERE user_id = ($1) AND delete_flag = false RETURNING *",
        [
          userID,
          firstName,
          lastName,
          userRole,
          userStatus,
          userPermissions,
          userPrograms,
        ]
      )
        .then((data) => {
          res
            .status(200)
            .json({ status: "success", data: data, message: "user updated" });
        })
        .catch((err) => {
          res
            .status(400)
            .json({ status: "error", data: err, mesage: "bad request" });
        });
      }
    } else{
      res.status(401)
        .json({ status: "error", message:'Can not allow to update user role: ' + userRole.toString()})   
    }
  }
}

function updateUserByAdmin(req, res, next) {
  const userID = parseInt(req.params.id);
  const email = req.body.user_email;
  const firstName = req.body.first_name;
  const lastName = req.body.last_name;
  const userRole = req.body.user_role;
  const domain = req.body.domain;
  
  let roleNo = authUser.authRole(userRole);
  
  let sel_db = cdb.getDomainDB(domain);
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    // let allow = authUser.checkClientRole(userRole,accessLevel);
    // if(allow){
      if (roleNo > 1 ) {
        res.status(401)
          .json({ status: "error", mesage: 'This user is not have permissions to change the name, email'}) ;  
      } else {
        sel_db.any("UPDATE users SET email = ($2), first_name = ($3), last_name = ($4) WHERE user_id = ($1) AND delete_flag = false RETURNING *",
          [
            userID,
            email,
            firstName,
            lastName,
          ]
        )
        .then((data) => {
          res
            .status(200)
            .json({ status: "success", data: data, message: "user updated" });
        })
        .catch((err) => {
          res
            .status(400)
            .json({ status: "error", data: err, mesage: "bad request" });
        });
      }
    } else{
      res.status(401)
        .json({ status: "error", mesage:'Can not allow to update user role: ' + userRole.toString()})   
    }
  }
// }
function updateUserByEmail(req, res, next) {
  const email = req.body.user_email;
  const firstName = req.body.first_name;
  const lastName = req.body.last_name;
  const userRole = req.body.user_role;
  const userStatus = req.body.user_status;
  const userPermissions = JSON.stringify(req.body.user_permissions);
  const userPrograms = JSON.stringify(req.body.user_programs)
  let roleNo = authUser.authRole(userRole);
  let card_edit = JSON.parse(userPermissions).cards_edit;
  let card_print = JSON.parse(userPermissions).cards_print;
  let card_reject = JSON.parse(userPermissions).cards_reject;
  let nfc_write = JSON.parse(userPermissions).nfc_write;
  let batch_loading = JSON.parse(userPermissions).batch_loading;

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    let allow = authUser.checkClientRole(userRole,accessLevel);
    if(allow){   
      if (roleNo < 3 && batch_loading){
        res.status(401)
          .json({ status: "error", message: "This user is not have batch loading permission" });
      } else if (roleNo === 4 && (card_edit || card_print || card_reject || nfc_write || batch_loading)){   
        res.status(401)
          .json({ status: "error", message: "Card Holder is not have permissions: edit, print, reject, nfc write, or batch loading" });
      } else {
        companyDB.any(
        "UPDATE users SET first_name = ($2), last_name = ($3), user_role = ($4), user_status =($5), user_permissions = ($6), user_programs = ($7)  WHERE email = ($1) AND delete_flag = false RETURNING *",
        [
          email,
          firstName,
          lastName,
          userRole,
          userStatus,
          userPermissions,
          userPrograms,
        ]
      )
        .then((data) => {
          res
            .status(200)
            .json({ status: "success", data: data, message: "user updated" });
        })
        .catch((err) => {
          res
            .status(400)
            .json({ status: "error", data: err, mesage: "bad request" });
        });
      }
    } else{
      res.status(401)
        .json({ status: "error", mesage: 'Can not allow to update user role: ' + userRole.toString()})   
    }      
  }
}


function getUsersByEmail(req, res, next) {
  const email = req.body.email;
  if (accessLevel < 4){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("SELECT * FROM users WHERE email = ($1) AND delete_flag = false", [email])
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get user success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})    
  }
}


function getAllUsers(req, res, next) {
  if (accessLevel < 4){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("SELECT * FROM users WHERE delete_flag = false")
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get user success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function getUsersOnAdmin(req, res, next) {
  let domain = req.body.domain
  let domain_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 2 ){
      domain_db.any("SELECT * FROM users WHERE delete_flag = false")
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get users success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      }); 
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function getProgramList(req, res, next) {
  if (accessLevel < 4){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("SELECT * FROM program")
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get program list success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function getPermissionList(req, res, next) {
  if (accessLevel < 4){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("SELECT * FROM permission_lst")
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get permission list success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}


function getUsersByRange(req, res, next) {
  const startID = req.body.start_id;
  const endID = req.body.end_id;
  if (accessLevel < 4){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any(
      "SELECT * FROM users WHERE user_id BETWEEN ($1) AND ($2) ORDER BY user_id ASC",
      [startID, endID]
    )
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get users success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function verifyUserPassword(req, res, next) {
  const userID = parseInt(req.params.id);
  const oldPassword = req.body.old_password;
  let result = verifytoken(req, res, next);
  if(result ==='true'){
  companyDB.any("SELECT password from user_passwords WHERE user_ID = ($1)", [userID])
    .then(function (data) {
      if (oldPassword != data[0].password) {
        res.status(200).json({
          status: "unauthorized",
          data: data,
          message: "Incorrect current password",
        });
        this.skipPassword = true
        next();
      } else {
        req.body.authorized = authorized;
        this.skipPassword = false;
        next();
      }
    })
    .catch(function (err) {
      res
        .status(400)
        .json({ status: "error", data: data, message: "bad request" });
    });
  }
}

function changeUserPassword(req, res, next) {
  // const authorization = req.body.authorized;
  const userID = parseInt(req.params.id);
  const newPassword = req.body.new_password;
  const email = req.body.email;
  let result = verifytoken(req, res, next);
  if (this.skipPassword === false) {
    if(result ==='true'){
    companyDB.any("UPDATE user_passwords SET password = ($2) WHERE user_id = ($1)", [
      userID,
      newPassword,
    ])
      .then((data) => {
        let subject = 'Change the password';
        let title = "Change the password";
        let content = '<center> <h2>Change the password</h2><br> <p>Your password has updated successfully.</p><br> <p>New Password : ' + newPassword + '</p> <br><p>If you have any issue, you can let know Admin.</p> <br/> <h4>Thanks for choosing Veritec.Inc website.</h4></center>'
        sendEmail(email, subject, title, content);
        res
          .status(200)
          .json({ status: "success", message: "password changed" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  }
  else{
      res.status(200)  
  }
}

function forgotPassword(req, res, next) {
  const email = req.body.email;
  const password = Math.random().toString(36).slice(-8);
  companyDB = cdb.getDatabase(email);
    companyDB.tx(async (t) => {
    const q1 = await t.any("SELECT user_id FROM users WHERE email = ($1) AND delete_flag = false", [
      email,
    ]);
    const q2 = await t.any(
      "UPDATE users SET user_status = ($2)  WHERE user_id = ($1)",
      [q1[0].user_id, "enabled"]
    );
    const q3 = await t.any(
      "UPDATE user_passwords SET password = ($2) WHERE user_id = ($1)",
      [q1[0].user_id, password]
    );

    return t.batch([q1, q2, q3]);
  })
    .then((data) => {
      res
        .status(200)
        .json({ status: "success", data: data, message: "password reset" });
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data: err, message: "bad request" });
    });
  }

  function userEnabled(req, res, next) {
    const userID = parseInt(req.params.id);
    const status = req.body.status;
    const domain = req.body.domain
    let domain_db = cdb.getDomainDB(domain);
    if (accessLevel < 3){
      let result = verifytoken(req, res, next);
      if(result ==='true'){
        domain_db.any("UPDATE users SET user_status = ($2) WHERE user_id = ($1) AND delete_flag = false", [
          userID, status,
      ])
        .then((data) => {
          res.status(200).json({
            status: "success",
            data: data,
            message: "user status updated",
          });
        })
        .catch((err) => {
          res
            .status(400)
            .json({ status: "error", message: "bad request" });
        });
      }
    } else {
      res.status(401)
        .json({ status: "error",  message:'Not Allow'})
    }
  }


function deleteUser(req, res, next) {
  const userID = parseInt(req.params.id);
  const status = true;
  if (accessLevel < 3){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("UPDATE users SET delete_flag = ($2) WHERE user_id = ($1)", [
      userID,
      status,
    ])
      .then((data) => {
        res.status(200).json({
          status: "success",
          data: data,
          message: "A user has deleted successful",
        });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function deleteUserByAdmin(req, res, next) {
  const userID = parseInt(req.params.id);
  const domain = req.body.domain
  let domain_db = cdb.getDomainDB(domain);
  const status = true;
  if (accessLevel < 3){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
      domain_db.any("UPDATE users SET delete_flag = ($2) WHERE user_id = ($1)", [
      userID,
      status,
    ])
      .then((data) => {
        res.status(200).json({
          status: "success",
          data: data,
          message: "A user has deleted successful",
        });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

// card programs
function createCardProgram(req, res, next) {
  const programName = req.body.program_name
  const programTemplate = req.body.program_template
  const cardImage = req.body.card_image
  const backImage = req.body.back_img
  const logo = req.body.logo
  const compression = req.body.compression
  const edac = req.body.edac
  const matrixSize = req.body.matrix_size
  const pxpcw = req.body.pxpcw
  const sampleWidth = req.body.sample_width
  const prefilter = req.body.prefilter
  const created_user = req.body.user
  const sel_domain = req.body.domain
  const printed_size = req.body.printed_size
  const jsonbarcode = req.body.jsonbarcode
  
  const template = JSON.stringify(programTemplate)
  const json_barcode = JSON.stringify(jsonbarcode)
  
  //get date 
  let ddd = new Date();
  let dd = String(ddd.getDate()).padStart(2, '0');
  let mm = String(ddd.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = ddd.getFullYear();
  const today = mm + '-' + dd + '-' + yyyy;

  let card_edit = JSON.parse(current_Permission).cards_edit;
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 4){
      if (card_edit){
        let domain_db = cdb.getDomainDB(sel_domain);
        if (domain_db){
          domain_db.any(
            "INSERT INTO card_programs (program_name, program_template, card_image_front, card_image_back, logo, compression, edac, matrix_size, pxpcw, sample_width, prefilter, created_user, created_date, modified_user, modified_date, printed_size, jsonbarcode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING program_id",
            [
              programName,
              template,
              cardImage,
              backImage,
              logo,
              compression,
              edac,
              matrixSize,
              pxpcw,
              sampleWidth,
              prefilter,
              created_user,
              today,
              created_user,
              today,
              printed_size,
              json_barcode,
            ]
          )
          .then((data) => {
            res.status(200).json({
              status: "success",
              data: data,
              message: "card program created",
            });
          })
          .catch((err) => {
            res.status(400)
              .json({ status: "error", data: err, message: "bad request" });
          });
        } else {
          res.status(401)
            .json({ status: "error", data: err, message: "No Database" });
        }        
      } else {
        res.status(401)
          .json({ status: "error", data: err, message: "No Permission" });  
      }
    } else {
      res.status(401)
      .json({ status: "error",  message:'Not Allow'})
    }
  }
}

function editCardProgram(req, res, next) {
  const programID = req.body.program_id
  const programName = req.body.program_name
  const programTemplate = req.body.program_template
  const cardImage = req.body.card_image
  const backImage = req.body.back_img
  const logo = req.body.logo
  const compression = req.body.compression
  const edac = req.body.edac
  const matrixSize = req.body.matrix_size
  const pxpcw = req.body.pxpcw
  const sampleWidth = req.body.sample_width
  const prefilter = req.body.prefilter
  const modified_user = req.body.user
  const sel_domain = req.body.domain
  const printed_size = req.body.printed_size
  const jsonbarcode = req.body.jsonbarcode
  
  const template = JSON.stringify(programTemplate)
  const json_barcode = JSON.stringify(jsonbarcode)

  //get date 
  let ddd = new Date();
  let dd = String(ddd.getDate()).padStart(2, '0');
  let mm = String(ddd.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = ddd.getFullYear();
  const today = mm + '-' + dd + '-' + yyyy;

  let card_edit = JSON.parse(current_Permission).cards_edit;
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 4){
      if(card_edit){
        let domain_db = cdb.getDomainDB(sel_domain);
        if (domain_db){
          domain_db.any(
            "UPDATE card_programs SET program_name = ($2), program_template = ($3), card_image_front = ($4), card_image_back = ($5), logo = ($6), compression = ($7), edac = ($8), matrix_size = ($9), pxpcw = ($10), sample_width = ($11), prefilter = ($12), modified_user = ($13), modified_date = ($14), printed_size = ($15), jsonbarcode = ($16) WHERE program_id = ($1) AND delete_flag = false",
            [
              programID,
              programName,
              template,
              cardImage,
              backImage,
              logo,
              compression,
              edac,
              matrixSize,
              pxpcw,
              sampleWidth,
              prefilter,
              modified_user,
              today,
              printed_size,
              json_barcode,
            ]
          )
            .then((data) => {
              res
                .status(200)
                .json({ status: "success", data: data, message: "card updated" });
            })
            .catch((err) => {
              res
                .status(400)
                .json({ status: "error", data: err, message: "bad request" });
            });
        } else {
          res.status(401)
          .json({ status: "error", data: err, message: "No Database" });
        }
      } else{
        res.status(401)
           .json({ status: "error", data: err, message: "Not Permission" });
      }
    } else {
      res.status(401)
      .json({ status: "error",  message:'Not Allow'})
    }
  }
}

function programEnabled(req, res, next) {
  const programID = parseInt(req.params.id);
  const status = req.body.status;
  const sel_domain = req.body.domain
  if (accessLevel < 3){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
      let domain_db = cdb.getDomainDB(sel_domain);
      if (domain_db){
        domain_db.any("UPDATE card_programs SET program_enabled = ($2) WHERE program_id = ($1) AND delete_flag = false", [
          programID,
          status,
        ])
          .then((data) => {
            res.status(200).json({
              status: "success",
              message: "program status updated",
            });
          })
          .catch((err) => {
            res
              .status(400)
              .json({ status: "error", data: err, message: "bad request" });
          });
      } else {
        res
        .status(401)
        .json({ status: "error", message: "No Database" });
      }
    } else {
      res
      .status(401)
      .json({ status: "error", message: "Not Permission" });
    }
  } else {
    res.status(401)
    .json({ status: "error",  message:'Not Allow'})
  }
}

function deleteProgram(req, res, next) {
  const programID = parseInt(req.params.id);
  const status = true;
  const sel_domain = req.body.domain
  if (accessLevel < 3){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
      let domain_db = cdb.getDomainDB(sel_domain);
      if (domain_db){
        domain_db.any("UPDATE card_programs SET delete_flag = ($2) WHERE program_id = ($1)", [
          programID,
          status,
        ])
          .then((data) => {
            res.status(200)
              .json({status: "success", message: "program has deleted"});
          })
          .catch((err) => {
            res
              .status(400)
              .json({ status: "error", data: err, message: "bad request" });
          });
      } else {
        res
          .status(401)
          .json({ status: "error", message: "No Database" });
      }
    } else {
      res
        .status(401)
        .json({ status: "error", message: "Not Permission" });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function getCardProgrambyID(req, res, next) {
  const programID = parseInt(req.params.id);
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if(accessLevel < 4){
      companyDB.any("SELECT * from card_programs WHERE program_id = ($1) AND delete_flag = false", [programID])
        .then((data) => {
          res.status(200)
            .json({
                status: "success",
                data: data,
                message: "get card program success",
              });
        })
        .catch((err) => {
          res
            .status(400)
            .json({ status: error, data: err, message: "bad request" });
        });
    } else {
      res.status(401)
        .json({ status: "error",  message:'Not Permission'})
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function getAllCardPrograms(req, res, next) {
  const sel_domain = req.body.domain
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    // if (accessLevel < 4){
      let domain_db = cdb.getDomainDB(sel_domain);
      if (domain_db){
        domain_db.any("SELECT * FROM card_programs WHERE delete_flag = false ORDER BY program_id")
          .then((data) => {
            res.status(200).json({
              status: "success",
              data:data,
              message: "get card programs success",
            });
          })
          .catch((err) => {
            res
              .status(400)
              .json({ status: "error", data: err, message: "bad request" });
          });
      } else {
        res.status(401)
          .json({ status: "error", data: err, message: "No Database" });
      }
    // } else {
    //   res.status(401)
    //   .json({ status: "error",  message:'Not Allow'})
    // }
  }
}

function addAvailableCards(req, res, next) {
  const userProgram = JSON.stringify(req.body.user_programs);
  let objUserProgram = JSON.parse(userProgram);
  let prograNname = Object.keys(objUserProgram);
  let startCard = req.body.start_card;
  let endCard = req.body.end_card;
  let availableProgram = checkprogram(prograNname[0].toString());
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (availableProgram){  
      if (accessLevel < 4){
      for (let i = startCard; i < endCard + 1; i++) {
        companyDB.any("INSERT INTO ($1) SET card_id = ($2)", [prograNname[0].toString(), i])
          .then((data) => {
            res
              .status(200)
              .json({ status: "success", data: data, message: "cards added" });
          })
          .catch((err) => {
            res
              .status(400)
              .json({ status: "error", data: err, message: "bad request" });
          });
        }
      } else {
        res.status(401)
        .json({ status: "error",  message:'Not Allow'})
      }
    }
  } else {
    res.status(401)
    return res.send('Not Allow ' + prograNname[0])  
  }
}

// cards
function orderCard(req, res, next) {
  faceimage = req.body.face_image;
  compressedfaceimage = req.body.compressed_face_image;
  programid = req.body.program_id,
  codeFields = req.body.code_fields;
  serverFields = req.body.server_fields;
  available = req.body.available;
  barcode = req.body.barcode;
  nfcfields = req.body.nfc_fields;
  uuid = req.body.unique_id;
  createduser = req.body.created_user;
  modifieduser = req.body.modified_user;
  cardstatus = 'ordered';
  //get date 
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  today = mm + '-' + dd + '-' + yyyy;
  let result = verifytoken(req, res, next);
  let availableProgram = true;

  if(result ==='true'){
    if (availableProgram){      
        // Todo: Discuss with Twitch about the program and programs        
        // companyDB.any(
        // "INSERT INTO program (email, phone, first_name, middle_name, last_name, address1, address2, city, state, zip_code, face_image, compressed_face_image, program_id, code_fields, server_fields, available, barcode, nfc_fields, created_date, created_user, modified_date, modified_user, cardstatus) VALUES (($1), ($2), ($3), ($4), ($5), ($6),($7),($8),($9),($10),($11),($12),($13),($14),($15),($16),($17),($18),($19),($20),($21),($22),($23)) RETURNING card_id",
        companyDB.any(
          "INSERT INTO program ( face_image, compressed_face_image, program_id, code_fields, server_fields, available, barcode, nfc_fields, created_date, created_user, modified_date, modified_user, cardstatus, unique_id) VALUES (($1), ($2), ($3), ($4), ($5), ($6), ($7), ($8), ($9), ($10), ($11), ($12), ($13), ($14)) RETURNING card_id",
        [        
          faceimage,
          compressedfaceimage,
          programid,
          codeFields,
          serverFields,
          available,
          barcode,
          nfcfields,
          today,
          createduser,
          today,
          modifieduser,
          cardstatus,
          uuid,
        ]
      );
      res.status(200)
        .json({ status: "success", message: "Card Order success" });
    } else {
      res.status(401)
        .json({ status: "unauthorized", message: "Not Permission" });
    }
  } else {
    res.status(401)
      .json({ status: "unauthorized", message: "Not Allow" });
  }
}


function editCard(req, res, next) {
  // Add logic to create compressed image and insert if card image is updated
  let programname = 'program' 
  cardID = req.body.card_id;
  codeFields = req.body.code_fields;
  serverFields = req.body.server_fields;
  available = req.body.card_status
  faceimage = req.body.face_image;
  compressedfaceimage = req.body.compressed_face_image;
  barcode = req.body.barcode;
  modifieduser = req.body.modified_user;
  cardstatus = req.body.cardstatus

  //get date 
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  today = mm + '-' + dd + '-' + yyyy;
  //update card status
  let card_status = 'ordered' //pdf count
  if (cardstatus === 'printed' || cardstatus === 'updated'){
    card_status = 'updated' //don't count the number of printed pdf
  }
  
  let availableProgram = true;
  let card_edit = true
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if(availableProgram) {
      if (card_edit){
        // companyDB.any(
        //   "UPDATE program SET email = ($2), phone = ($3), first_name = ($4), middle_name = ($5), last_name = ($6), address1 = ($7), address2 = ($8), city = ($9), state = ($10), zip_code = ($11), code_fields = ($12), server_fields = ($13), available = ($14), face_image = ($15), compressed_face_image = ($16), barcode = ($17), modified_date = ($18), modified_user = ($19) WHERE card_id = ($20)",
        companyDB.any(
          "UPDATE program SET code_fields = ($2), server_fields = ($3), available = ($4), face_image = ($5), compressed_face_image = ($6), barcode = ($7), modified_date = ($8), modified_user = ($9), cardstatus = ($10) WHERE card_id = ($11) AND delete_flag = false",
          [
            programname,
            codeFields,
            serverFields,
            available,
            faceimage,
            compressedfaceimage,
            barcode,
            today,
            modifieduser,
            card_status,
            cardID,
          ]
        );
        res.status(200)
          .json({ status: "success", message: "Card Update success" });
      } else {
        res.status(401)
          .json({ status: "unauthorized", message: "Not Permission" });
      }
    } else {
      res.status(401)
        .json({ status: "unauthorized", message: "Not Allow" });
    }
  } else {
    res.status(401)
      .json({ status: "unauthorized", message: "Not Allow" });
  }
}


function getAllCards(req, res, next) {
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    companyDB.any("select p.*, c.program_name from program p LEFT JOIN card_programs c ON p.program_id = c.program_id WHERE p.available = true AND p.delete_flag = false ORDER BY p.card_id ASC")
    .then((data) => {
      res
        .status(200)
        .json({ status: "success", data: data, message: "get card success" });
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data: err, message: "bad request" });
    });
  }
}

function setCardStatus(req, res, next) {
  const cardId = parseInt(req.params.id);
  const status = req.body.status;
  if (accessLevel < 3){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("UPDATE program SET cardstatus = ($2) WHERE card_id = ($1) AND delete_flag = false", [
      cardId,
      status,
    ])
      .then((data) => {
        res.status(200).json({
          status: "success",
          message: "card status updated",
        });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function deleteCard(req, res, next) {
  const cardId = parseInt(req.params.id);
  const status = true;
  if (accessLevel < 3){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("UPDATE program SET delete_flag = ($2) WHERE card_id = ($1)", [
      cardId,
      status,
    ])
      .then((data) => {
        res.status(200)
        .json({ status: "success", message: "card has deleted",
        });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
  } else {
    res.status(401)
      .json({ status: "error",  message:'Not Allow'})
  }
}

function getCardByID(req, res, next) {
  const cardProgram = "program";  
  const cardNumber = parseInt(req.params.id);
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    companyDB.any(`SELECT * FROM program WHERE card_id = ${cardNumber} AND delete_flag = false`)
    .then((data) => {
      res
        .status(200)
        .json({ status: "success", data: data, message: "get card success" });
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data: err, message: "bad request" });
    });
  } else{
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  } 
}

function getCardIDByUid(req, res, next){
  const uuid = req.params.uid;
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    companyDB.any("SELECT * FROM program WHERE unique_id = ($1) AND delete_flag = false", [
    uuid,
  ])
    .then((data) => {
      res
        .status(200)
        .json({ status: "success", data: data, message: "get card id success" });
    })
    .catch((err) => {
      res
        .status(400)
        .json({ status: "error", data: err, message: "bad request" });
    });
  } else{
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }
}

function getCardsByRange(req, res, next) {
  const cardProgram = req.body.card_program;
  const startCard = req.body.start_card;
  const endCard = req.body.end_card;
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 4){
      companyDB.any(
      "SELECT * FROM ($1) WHERE delete_flag = false AND card_id BETWEEN ($2) AND ($3) ORDER BY card_id ASC",
      [cardProgram, startCard, endCard]
    )
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get cards success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res.status(401)
      .json({ status: "error",  message:'Not Allow'})      
    }
  }
}

// function checkprogram (program_id) {
//   // let proga1 = JSON.parse(current_programs);
//   let result = 'program' + program_id.toString();
//   return result;
// }

// User Login

function userLogin(req,res,next){
  const email = req.body.email;
  const password = req.body.password;
  this.secret = cdb.getDomain(email);
  const timeStamp = new Date().getTime();
  console.log(timeStamp);
  companyDB = cdb.getDatabase(email);
  console.log(email);
  companyDB.any("SELECT u.user_id, u.user_role, u.user_status, u.user_permissions, u.user_programs FROM users u LEFT JOIN user_passwords upss ON u.user_id = upss.user_id  WHERE u.email = ($1) and upss.password = ($2)",
       [email, password])
        .then((data) => {
          if (data.length > 0){
            current_userid = data[0].user_id;
            current_role = data[0].user_role;
            accessLevel  = authUser.authRole(current_role);
            current_Permission = data[0].user_permissions;
            current_programs = data[0].user_programs;
            current_domain = this.secret;
            this.tokenid = data[0].user_id;
            this.jwt = jwt.sign({id: this.tokenid}, this.secret, {expiresIn: 60000});
            req.session.jwt = this.jwt;
            console.log(this.jwt);  
            res.status(200)
              .json({
                status: "success",
                data: data,
                token:this.jwt,
                domain:this.secret,
                message: "ready to use token",
              });
          } else {
            res
            .status(400)
            .json({ status: "error", message: "password or email incorrect!" });
          }
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      })
      // For imediate app exit, shutting down the connection pool.
      .finally(() =>{
      })
    }

function userLogout(req,res,next){
  req.session.destroy();
  accessLevel = 4;
  current_Permission = dbAuth.permissions ;
  current_programs = dbAuth.userprogram;

  res.status(200).json({
    status:"success", 
    message:"Logout successfully."
  });
}

function verifytoken (req,res,next) {
  const bearerHeader = req.headers['authorization'];
  let decode ;

  if (typeof bearerHeader !=='undefined'){
    const bearer = bearerHeader.split(' ');
    const bearToken = bearer[1];
  let decoded
  let secretCode = this.secret;
  let token ='';
  if (typeof this.jwt !=='undefined'){
    token = this.jwt.toString();
  }

  if(token === bearToken.toString()){
    try {
          decoded = jwt.verify(token, this.secret)
          return 'true';
        } catch (e) {
           res.status(400)
          .json({
            status: 'fail',
            message: 'Token is expired'
          });
        }
        return 'false';
    } else{
      res.status(404)
      .json({
        status: 'fail',
        message: 'Token is not matched'
      });
      return 'false';
    }
  }
}

function Encode(req, res, next) {
  let message = req.body.message;
  const encodemsg = JSON.stringify(message)
  console.log('encode message : ', encodemsg)
  const arg_msg = encodemsg.replace(/\"/g, '#')
  console.log('encode message : ', arg_msg)
  const matsize = req.body.matrixsize;
  const edac = req.body.edac;
  const compress = req.body.compression;
  const obj = JSON.parse(current_Permission);
  let cardOrderPermission = obj.cards_order;
   if (cardOrderPermission) {
    var blank =" ";
    var quote ='"';
    var execfile = "./vw";
    let scriptEncode = execfile + blank + quote + arg_msg + quote + blank + compress+ blank + matsize + blank + edac;
    try {
      exec(scriptEncode, (error, stdout, stderr) => {
        if (error) {
          console.error(error.message);
        }
        if (stderr) {
          console.log(stderr.message);
        }
        if (stdout==='Fail'){
          return res.status(400)
                    .json({ status: "error", encoded:message, matrixside:matsize, edac: edac,compression:compress, data: stdout, message: "encode fail" });

        } else {
          return res.status(200)
                    .json({ status: "success", encoded:message, matrixside:matsize, edac: edac,compression:compress, data: stdout, message: "Vericode encode success" });
        }
    });
    } catch (error) {
      return res
      .status(400)
      .json({ status: "error", data: error, message: "encode fail" });
    }
  } else {
    return res
    .status(401)
    .json({ status: "error", message: "user not allow to encode" });   
  }
}


function Decode(req, res, next) {
  const base64image = req.body.base64image;
  const matsize = req.body.matrixsize;
  const samplewidth = req.body.samplewidth;
  const pixelspercell = req.body.pixelspercell;
  const edac = req.body.edac;
  const obj = JSON.parse(current_Permission);
  let cardReadPermission = obj.cards_read;
  if (cardReadPermission) {  
    var blank =" ";
    var quote ='"';
    var execfile = "./vcread";
    let bitmapFile = "Vericode24.bmp"
    let scriptDecode = execfile + blank + bitmapFile + blank + matsize + blank + samplewidth + blank + pixelspercell +  blank + edac ;
    var bsave = base64_decode(base64image,bitmapFile);
    if (bsave){
      exec(scriptDecode, (error, stdout, stderr) => {
        if (error) {
          console.error(error.message);
        }
        if (stderr) {
          console.log(stderr.message);
        }
  //     console.log(stdout);
        return res        
        .status(200)
        .json({ status: "success", data: stdout, message: "decode successful" });
    });

    } else{
      return res
          .status(400)
          .json({ status: "error", message: "decode fail" });   
    }
  } else {
    return res
      .status(401)
      .json({ status: "error", message: "user not allow to decode image" });   
  }
}

// Scan Card Table
function getAllScanData(req, res, next) {
    let result = verifytoken(req, res, next);
    if(result ==='true'){
    companyDB.any("SELECT * FROM scandata")
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get scanned data success" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    }
}

// Insert scan data after NFC or Decode barcode
function scanCard(req, res, next) {
  information = req.body.information;
  scantype = req.body.scantype;
  scanned_user = req.body.scanned_user,
  deviceID = req.body.deviceID;
  //get date 
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  today = mm + '-' + dd + '-' + yyyy;
  scanned_date = today;

  let result = verifytoken(req, res, next);
  if(result ==='true'){
//    if (availableProgram){      
        companyDB.any(
          "INSERT INTO scandata (information, scantype, scanned_user, scanned_date, deviceid) VALUES (($1), ($2), ($3), ($4), ($5)) RETURNING scan_id",
        [        
          information,
          scantype,
          scanned_user,
          scanned_date,
          deviceID
        ]
      );
      res.status(200)
        .json({ status: "success", message: "Scan Data success" });
/*    } else {
      res.status(401)
      .json({ status: "unauthorized", message: "Not Permission" });
    } */
    } else {
    res.status(401)
      .json({ status: "unauthorized", message: "Not Allow" });
  }
}

async function compress_image(req, res, next){
  let base64image = req.body.file;
  fs.access("./uploads", (error) => {
    if (error) {
      fs.mkdirSync("./uploads");
    }
  });
  var matches = base64image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  let imageBuffer = new Buffer(matches[2], 'base64');
  let type = matches[1];
  let extension = mime.extension(type);
  const timestamp = new Date().toISOString().replace(/T/, '-').replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '');
  let fileName = `image-${timestamp}.${extension}`;
  let webpName = `webp-${timestamp}.webp`;
  try {
    fs.writeFileSync("./uploads/" + fileName, imageBuffer, 'utf8');

    let quality = 50;
    for (quality = 50; quality > 0 ; quality -= 5){
      try {
        await sharp("./uploads/" + fileName)
          .resize({ width: 80, height: 80, fit: "contain" })
          .removeAlpha()
          .webp({ quality: quality, alphaQuality: 0, lossless: false })
          .toFile("./uploads/" + webpName);
  
        //console.log("webp filename : " + webpName);
        try{
          let stats = await getfilestats(webpName);
          if (stats.size < 550) {
            break;
          } 
        } catch(ex){
          return res.status(400)
                    .json({ status: "error", message: "File doesn't exist."});
        }
      } catch (e) {
        return res
          .status(400)
          .json({ status: "error", message: "Image compress failed" });
      }
    }
    //read webp file as base64
    const webp_file = fs.readFileSync('./uploads/' + webpName, {encoding: 'base64'})
    //delete origin file and webp file
    fs.unlinkSync("./uploads/" + fileName)
    fs.unlinkSync("./uploads/" + webpName)
    return res
          .status(200)
          .json({ status: "success", webp: webp_file, message: "Image compress success" });
  } catch (e) {
    return res
      .status(400)
      .json({ status: "error", message: "Image file save failed" });
  }
}

async function compress_image_filename(req, res, next){
  let fileName = req.body.filename;
  const fname = fileName.split('.');
  let webpName =  `webp-${fname[0]}.webp`;
  let quality = 50;
    for (quality = 50; quality > 0 ; quality -= 5){
      try {
        await sharp("./uploads/" + fileName)
          .resize({ width: 80, height: 80, fit: "contain" })
          .removeAlpha()
          .webp({ quality: quality, alphaQuality: 0, lossless: false })
          .toFile("./uploads/" + webpName);
  
        try{
          let stats = await getfilestats(webpName);
          if (stats.size < 550) {
            break;
          } 
        } catch(ex){
          return res.status(400)
                    .json({ status: "error", message: "File doesn't exist."});
        }
      } catch (e) {
        return res
          .status(401)
          .json({ status: "error", message: "Image compress failed" });
      }
    }
    //read webp file as base64
    const webp_file = fs.readFileSync('./uploads/' + webpName, {encoding: 'base64'})
    //delete origin file and webp file
    fs.unlinkSync("./uploads/" + webpName)
    return res
          .status(200)
          .json({ status: "success", webp: webp_file, message: "Image compress success" });
}

// function to create file from base64 encoded string
function base64_decode(base64str, file) {
  // create buffer object from base64 encoded string, it is important to tell the constructor that the string is base64 encoded
  try {
    var bitmap = new Buffer(base64str, 'base64');
    // write buffer to file
    fs.writeFileSync(file, bitmap);
    console.log('******** File created from base64 encoded string ********');
    return true;
  } catch (error) {
    return false;
  }
}

// function to get the file size syncronize
function getfilestats(filename){
  return new Promise((resolve, reject)=>{
    fs.stat("./uploads/" + filename, (err, stats) => {
      if (err) {
          reject(err)
      } else {
          resolve(stats)
      }
    });
  
  })
}

async function generateVCard(req,res,next){
  fs.access("./vcards", (error) => {
    if (error) {
      fs.mkdirSync("./vcards")
    } 
  });
  
  codeFields = req.body.code_fields;
  cardID = codeFields.card_id;
  firstName = codeFields.first_name;
  lastName = codeFields.last_name;
  recipient = codeFields.email;
  serverFields = req.body.serverFields;
  available = req.body.card_status
  faceimage = req.body.face_image;
  compressedfaceimage = req.body.compressed_face_image;
  barcode = req.body.barcode;
  barcode_size = req.body.barcode_size
  program_id = req.body.program_id
  front_img = req.body.front_image
  back_img = req.body.back_image
  logo = req.body.logo
  cardstatus = req.body.cardstatus
  user_id = req.body.user_id
  license_id = req.body.license_id
  member_id = req.body.member_id
  printed_size = req.body.printed_size
  disp_txt = req.body.disp_txt

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    filename = cardID.toString() + current_domain.toString() + ".pdf"
    username = firstName + ' ' + lastName     //firstName.slice(0,1).toUpperCase() + '. ' + lastName

    // generates the vericode
    let size_per_width = barcode_size * 4  
    let buf_size = size_per_width * size_per_width * 4
    let buf = new ArrayBuffer(buf_size);
    let buffer = new Uint8Array(buf)
    let offset = 0
    let index = 0 
    for (let i=0; i < size_per_width; i++) {
      offset = i * size_per_width * 4;
      for (let j = 0; j < size_per_width * 4; j+=4){
        let x = j / 16
        index = parseInt(x) + parseInt(i/4) * barcode_size
        
        if (barcode[index] == "1"){
          buffer[offset+j] = 0      //R value
          buffer[offset+j+1] = 0      //G value
          buffer[offset+j+2] = 0      //B value
          buffer[offset+j+3] = 255      //Alpha
        } else if (barcode[index] == "0"){
          buffer[offset+j] = 255      //R value
          buffer[offset+j+1] = 255      //G value
          buffer[offset+j+2] = 255     //B value
          buffer[offset+j+3] = 255      //Alpha
        }
      }
    }

    const vericode = await sharp(buffer, {raw : {width:size_per_width, height : size_per_width, channels: 4}}).png().toBuffer()
    console.log("base64 : ", vericode);

    // Create a document
    const doc = new PDFDocument({size:[213, 338], layout:'landscape'});
    // Pipe its output somewhere, like to a file or HTTP response
    // See below for browser usage
    doc.pipe(fs.createWriteStream('./vcards/' + filename));
    // front page
    // Add an image, constrain it to a given size
    doc.image(front_img, 0, 0, {
      fit: [338, 213],
      align: 'left',
      valign: 'top'
    });
    for (let i = 0; i < disp_txt.length; i++){
      if (disp_txt[i].side == 1){
        let txt = disp_txt[i].label + " : " + disp_txt[i].value
        if (disp_txt[i].label == 'Member ID' || disp_txt[i].label == 'Card ID'){
          txt = "ID: " + disp_txt[i].value
        } else if (disp_txt[i].label == 'Name'){
          txt = disp_txt[i].value
        }
        doc.fontSize(disp_txt[i].size)
          .fillColor(disp_txt[i].color)
          .text(txt, disp_txt[i].xpos, disp_txt[i].ypos, {lineBreak: false})
      }
    }

    // Add back page: member ID, name, background, faceimage, logo
    doc.addPage({size:[338, 213]})
        .image(back_img, 0, 0, {
          fit: [338, 213],
          align: 'left',
          valign: 'top'
        })
        .image(faceimage, 15, 125, {
          fit: [70, 70]
        })
    for (let i = 0; i < disp_txt.length; i++){
      if (disp_txt[i].side == 2){
        let txt = disp_txt[i].label + " : " + disp_txt[i].value
        if (disp_txt[i].label == 'Member ID' || disp_txt[i].label == 'Card ID'){
          txt = "ID: " + disp_txt[i].value
        } else if (disp_txt[i].label == 'Name'){
          txt = disp_txt[i].value
        }
        doc.fontSize(disp_txt[i].size)
          .fillColor(disp_txt[i].color)
          .text(txt, disp_txt[i].xpos, disp_txt[i].ypos, {lineBreak: false})
      }
    }

    let code_size = 106
    if (printed_size === "small"){
      code_size = 66
    }
    
    // add vericode background
    doc.rect(317 - code_size, 192 - code_size, code_size + 8, code_size + 8)
      .fill('white');
    
    // add vericode image
    doc.image(vericode, 321 - code_size, 196 - code_size, {
      fit: [code_size, code_size],
      align: 'left',
      valign: 'top'
    });
    
    // Finalize PDF file
    doc.end();
    if (cardstatus === 'ordered'){      
      cardstatus = 'printed';
      //get date 
      let today = new Date();
      let dd = String(today.getDate()).padStart(2, '0');
      let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
      let yyyy = today.getFullYear();
      today = mm + '-' + dd + '-' + yyyy;
      modified_date = today;
      // database update
      companyDB.any(
        "UPDATE program SET vcard = ($1), cardstatus = ($3), modified_date = ($4), modified_user = ($5) WHERE card_id = ($2) RETURNING card_id",
        [
          filename,
          cardID,
          cardstatus,
          modified_date,
          user_id
        ]
      ).then((data) => {
        const domain = 'vrtc';
        let vrtc_db = cdb.getDomainDB(domain);
        vrtc_db.any(`UPDATE licenses SET card_count = card_count + 1 WHERE license_id = '${license_id}' RETURNING card_count`)
          // .then((data) => {              
          // }).catch((err) => {
          //   res
          //   .status(400)
          //   .json({ status: "error", data: err, message: "bad counting" });
          // })    
          // send email with pdf to recipient
          sendVCard(recipient, filename);
          return res
                  .status(200)
                  .json({ status: "success", vcard: filename, count: data, message: "VCard generate success" });    
      }).catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad updated" });
      });
    } else {
      cardstatus = 'printed';
      // database update
      companyDB.any(
        "UPDATE program SET vcard = ($1), cardstatus = ($3) WHERE card_id = ($2) RETURNING card_id",
        [
          filename,
          cardID,
          cardstatus
        ]
      ).then((data) => {
        // send email with pdf to recipient
        sendVCard(recipient, filename);
        return res
                .status(200)
                .json({ status: "success", vcard: filename, message: "VCard generate success" });
          })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad updated" });
      });
    }
  } else {
    return res
      .status(401)
      .json({ status: "Unauthorized", message: "Not Allow" }); 
  }
}

function sendVCard(recipient, filename){
  var transporter = nodemailer.createTransport({
    //// when use the outlook smtp
    // host: "smtp-mail.outlook.com", // hostname
    // secureConnection: false, // TLS requires secureConnection to be false
    // port: 587, // port for secure SMTP
    // tls: {
    //     ciphers:'SSLv3'
    // },

    // when use the office365 service
    service: "Outlook365",
    host: "smtp.office365.com",
    port: "587",
    tls: {
      ciphers: "SSLv3",
      rejectUnauthorized: false,
    },

    auth: {
      user: ADMIN_EMAIL_USER,
      pass: ADMIN_EMAIL_PASS
    }
  });

  let content = '<center> <h2>Created VCard</h2><br> <p>VCard has created successfully.</p><br> <br><p>If you have any issue, you can let know Admin.</p> <br/> <h4>Thanks for choosing Veritec.Inc website.</h4></center>'
  
  var mailOptions = {
    from: SENDER_EMAIL,
    to: recipient,
    subject: 'Create VCard',
    text: "Create VCard",
    html: content,
    attachments:[{
      path: './vcards/' + filename,
      name: filename,
      contentType: 'application/pdf'
      }]
  };
  
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}

function sendEmailAPI (req,res,next){
  recipient = req.body.email;
  pass = req.body.pass;
  let subject = 'Create new user and set the password';
  let title = "Create User";
  let content = '<center> <h2>Create New User</h2><br> <p>New user has created successfully.</p><br> <p>New Password : ' + password + '</p> <br><p>If you have any wrong, you can let know Admin.</p> <br/> <h4>Thanks for choosing Veritec.Inc website.</h4></center>'
  sendEmail(recipient, subject, title, content);
  return res
            .status(200)
            .json({ status: "success", message: "Email sent" });
}

/// outlook 
// Use your account email and password on outlook.com for ADMIN_EMAIL
// Use your account email for SENDER_EMAIL
const ADMIN_EMAIL_USER = '**************'; //youremail@outlook.com
const ADMIN_EMAIL_PASS = '**************';     // your password for your outlook email
const SENDER_EMAIL = '**********'; // your outlook email

function sendEmail(recipient, subject, title, content){
  // email server setting (using Mailtrap for development)
  // To test the email sending, I tried to use my mailtrap sandbox account.
  // You have to change the email setting. Try to look for 'nodejs how to send email' on google
  var transporter = nodemailer.createTransport({
    //// Don't use the mailtrap now 
    // host: 'smtp.mailtrap.io',
    // port: 2525,
    // // secure: true,    

    //// When use outlook smtp
    // host: "smtp-mail.outlook.com", // hostname
    // secureConnection: false, // TLS requires secureConnection to be false
    // port: 587, // port for secure SMTP
    // tls: {
    //     ciphers:'SSLv3'
    // },

    // When use office365 service
    service: "Outlook365",
    host: "smtp.office365.com",
    port: "587",
    tls: {
      ciphers: "SSLv3",
      rejectUnauthorized: false,
    },

    auth: {
      user: ADMIN_EMAIL_USER,
      pass: ADMIN_EMAIL_PASS
    }    
  });

  var mailOptions = {
    from: SENDER_EMAIL,
    to: recipient,
    subject: subject,
    text: title,
    html: content
  };
  
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
  
}

function addLicense(req,res,next){
  let domain_name = req.body.domain_name;
  let start_id = req.body.start_idcard;
  let end_id = req.body.end_idcard;
  let created_user = req.body.created_user;  
  let program_id = req.body.program_id;
  //get date 
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  today = mm + '-' + dd + '-' + yyyy;
  created_date = today;

  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 3 ){
      vrtc_db.any("INSERT INTO licenses ( domain_name, start_idcard, end_idcard, program_id, created_date, modified_date, created_user, modified_user) VALUES (($1), ($2), ($3), ($4), ($5), ($6), ($7), ($8)) RETURNING license_id",
        [        
          domain_name,
          start_id,
          end_id,
          program_id,
          created_date,
          created_date,
          created_user,
          created_user,
        ])
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "Insert license successfully" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      }); 
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function editLicense(req,res,next){
  let license_id = req.body.license_id;
  let domain_name = req.body.domain_name;
  let start_id = req.body.start_idcard;
  let end_id = req.body.end_idcard;
  let modified_user = req.body.modified_user;  
  let program_id = req.body.program_id;
  //get date 
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  today = mm + '-' + dd + '-' + yyyy;
  updated_date = today;

  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 3 ){
      vrtc_db.any("UPDATE licenses SET start_idcard = ($2), end_idcard = ($3), modified_date = ($4), modified_user = ($5), domain_name = ($6), program_id = ($7) WHERE license_id = ($1) AND delete_flag = false",
      [
        license_id,
        start_id,
        end_id,
        updated_date,
        modified_user,
        domain_name,
        program_id
      ]
    )
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "license updated" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function increaseCardCount(req, res, next){
  domain_name = req.body.domain_name;
  program_id = req.body.program_id;
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    // const obj = JSON.parse(current_Permission);
    // let cardPrintPermission = obj.cards_print;
    if (accessLevel < 3 ){                // || (accessLevel == 3 && cardPrintPermission)
      vrtc_db.any(`UPDATE licenses SET count = count + 1 WHERE domain_name = '${domain_name}' AND program_id = '${program_id}'`)
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "Increase count of card successfully" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function getLicense(req,res,next){
  const license_id = parseInt(req.params.id);
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    const obj = JSON.parse(current_Permission);
    let cardPrintPermission = obj.cards_print;
    if (accessLevel < 3 || (accessLevel == 3 && cardPrintPermission)){
      vrtc_db.any(`SELECT * FROM licenses WHERE license_id = ${license_id} AND delete_flag = false`)
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get licenses success"});
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function getLicenseByDomain(req,res,next){
  const domain_name = req.body.domain_name;
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    const obj = JSON.parse(current_Permission);
    let cardPrintPermission = obj.cards_print;
    if (accessLevel < 3 || (accessLevel == 3 && cardPrintPermission)){
      vrtc_db.any(`SELECT * FROM licenses WHERE domain_name LIKE '${domain_name}' AND delete_flag = false`)
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get licenses success"});
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function getLicenses(req,res,next){
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    const obj = JSON.parse(current_Permission);
    let cardPrintPermission = obj.cards_print;
    if (accessLevel < 3 || (accessLevel == 3 && cardPrintPermission)){
      vrtc_db.any(`SELECT * FROM licenses WHERE delete_flag = false`)
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get licenses success"});
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function deleteLicense(req,res,next){
  let status = true;
  let license_id = req.body.license_id;
  
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 2 ){
      vrtc_db.any("UPDATE licenses SET delete_flag = ($2) WHERE license_id = ($1)",
        [
          license_id, 
          status,
        ])
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "License has deleted successfully" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      }); 
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

// Domains
function getDomains(req,res,next){
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    const obj = JSON.parse(current_Permission);
    let cardPrintPermission = obj.cards_print;
    if (accessLevel < 3 || (accessLevel == 3 && cardPrintPermission)){
      vrtc_db.any(`SELECT * FROM domainlist WHERE delete_flag = false`)
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "get domain list success"});
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      });
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function createDomain(req,res,next){
  let domain_name = req.body.domain_name;
  
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 3 ){
      vrtc_db.any("INSERT INTO domainlist (domain_name) VALUES ($1) RETURNING domain_id",
        [        
          domain_name,
        ])
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "Add domain successfully" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      }); 
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function editDomain(req,res,next){
  let domain_name = req.body.domain_name;
  let domain_id = req.body.domain_id;
  
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 2 ){
      vrtc_db.any("UPDATE domainlist SET domain_name = ($2) WHERE domain_id = ($1) AND delete_flag = false",
        [
          domain_id, 
          domain_name,
        ])
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "Update domain successfully" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      }); 
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function deleteDomain(req,res,next){
  let status = true;
  let domain_id = req.body.domain_id;
  
  const domain = 'vrtc';
  let vrtc_db = cdb.getDomainDB(domain);

  let result = verifytoken(req, res, next);
  if(result ==='true'){
    if (accessLevel < 2 ){
      vrtc_db.any("UPDATE domainlist SET delete_flag = ($2) WHERE domain_id = ($1)",
        [
          domain_id, 
          status,
        ])
      .then((data) => {
        res
          .status(200)
          .json({ status: "success", data: data, message: "Domain has deleted successfully" });
      })
      .catch((err) => {
        res
          .status(400)
          .json({ status: "error", data: err, message: "bad request" });
      }); 
    } else {
      res
        .status(400)
        .json({ status: "error", data: "Error", message: "Not Permission" });
    }
  } else {
    res
        .status(401)
        .json({ status: "error", data: "Error", message: "Not Allow" });
  }    
}

function getTemplatelist(req, res, next) {
  sel_domain = req.body.domain;  
  let sel_db = cdb.getDomainDB(sel_domain);

  const obj = JSON.parse(current_Permission);
  let cardPrintPermission = obj.cards_print;
  if (accessLevel < 3 || (accessLevel == 3 && cardPrintPermission)){
    let result = verifytoken(req, res, next);
    if(result ==='true'){
      sel_db.any("SELECT * FROM card_programs ORDER BY program_id")
        .then((data) => {
          res
            .status(200)
            .json({ status: "success", data: data, message: "get program list success" });
        })
        .catch((err) => {
          res
            .status(400)
            .json({ status: "error", data: err, message: "bad request" });
        });
    } else {
      res.status(401)
      .json({ status: "error", message: "Not Permission" });
    }
  } else {
    res.status(401)
      .json({ status: "error", message: "Not Allow" });
  }
}

function makeCsvTemplate(req, res, next) {
  fs.access("./csv_templates", (error) => {
    if (error) {
      fs.mkdirSync("./csv_templates")
    } 
  });

  let program_name = req.body.program_name
  let domain = req.body.domain
  let data = req.body.data

  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0');   //January is 0!
  let yyyy = today.getFullYear();

  const filename = domain + '_' + program_name + '_' + yyyy + mm + dd + '.csv' 
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    // (C) CREATE CSV FILE
    csv.stringify(data, (err, output) => {
      fs.writeFileSync('./csv_templates/' + filename, output);
      if (err){
        res.status(400)
          .json({ status: "error", data: err, message: "bad request" });
      } else {
        res.status(200)
          .json({ status: "success", data: filename, message: "CSV template write success" })
      }
    });
  } else {
    res.status(401)
      .json({ status: "unauthorized", message: "Not Allow" });
  }
}

function downloadCsvTemplate(req, res){
  const filename = req.params.filename
  const filepath = './csv_templates/' + filename
  res.download(filepath, filename, (err)=>{
    if (err){
      res.send({error: err, message: "download failed"})
    }
  })
}

async function uploadZip(req, res, next){
  let result = verifytoken(req, res, next);
  if(result ==='true'){
    try {   
      await uploadFile(req, res)
      if (req.file == undefined) {
        return res.status(400).send({ message: "Please upload a file!" });
      }
      //unzip file
      decompress("uploads_zip/" + req.file.originalname, "uploads")
      .then((files) => {
        // console.log("files:", files)
        // console.log("domain:", current_domain)
        files.map((item) => {
          if (!item.path.includes("/")){
            fs.rename("uploads/" + item.path, "uploads/" + current_domain + "-" + item.path, function(error){
              if(error) { console.log("Rename Error: ", error)}
            } )
          }
        })
        res.status(200).send({
          message: "Uploaded the file successfully: " + req.file.originalname,
        });
      })
      .catch((err) => {
        return res.status(400).send({ message: `Could not unzip the file: ${req.file.originalname}. ${err}`});
      })    
    } catch (err) {
      if (err.code == "LIMIT_FILE_SIZE") {
        return res.status(401).send({
          message: "File size cannot be larger than 500MB!",
        });
      }
      res.status(500).send({
        message: `Could not upload the file: ${req.file.originalname}. ${err}`,
      });
    }
  } else {
    res.status(401)
      .json({ status: "unauthorized", message: "Not Allow" });
  }
} 

 module.exports = { 
  getDatabaseAPIKey, 
  getDatabaseEmail,
  createUser,
  getUserByID,
  updateUser,
  updateUserByEmail,
  updateUserByAdmin,
  getUsersByEmail,
  getAllUsers,
  getUsersByRange,
  getUsersOnAdmin,
  verifyUserPassword,
  changeUserPassword,
  forgotPassword,
  userEnabled,
  deleteUser,
  deleteUserByAdmin,
  createCardProgram,
  editCardProgram,
  programEnabled,
  deleteProgram,
  getCardProgrambyID,
  getAllCardPrograms,
  getAllCards,
  orderCard,
  editCard,
  addAvailableCards,
  getCardByID,
  getCardsByRange,
  setCardStatus,
  deleteCard,
  getCardIDByUid,
  userLogin,
  userLogout,
  Encode,
  Decode,
  compress_image,
  compress_image_filename,
  getProgramList,
  getPermissionList,
  generateVCard,
  sendEmailAPI,
  getAllScanData,
  scanCard,
  addLicense,
  increaseCardCount,
  getLicenses,
  getLicense,
  editLicense,
  getLicenseByDomain,
  deleteLicense,
  getDomains,
  getTemplatelist,
  createDomain,
  editDomain,
  deleteDomain,
  makeCsvTemplate,
  downloadCsvTemplate,
  uploadZip
};
