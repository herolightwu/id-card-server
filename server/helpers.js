const promise = require("bluebird");
const options = {
  promiseLib: promise,
};
var pgp = require("pg-promise")(options);
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
let current_domain = "";
let current_companyDB ="";

const dbAuth = require("./dbAuth");
const admindb = dbAuth.admin_db;
const idcarddb = dbAuth.idcard_db;
const companybase = dbAuth.company_base;

let key ="";
var dataObject = new Object();
function getDomain(email) {
  let findex = email.lastIndexOf("@") + 1;
  let domainExtension = email.substring(findex);
  let lindex = domainExtension.indexOf(".");
  let domain = domainExtension.substring(0,lindex);
  return domain;
}

function getDatabase(email) {
  let findex = email.lastIndexOf("@") + 1;
  let domainExtension = email.substring(findex) ;
  let lindex = domainExtension.indexOf(".");
  let domain = domainExtension.substring(0,lindex);
  let dbconnection = companybase + domain;
  let companyDB = dataObject[domain];
  if (companyDB === undefined){
    companyDB = pgp(dbconnection);   
    dataObject[domain] = companyDB;
  }
  return companyDB;
}

function getDomainDB(domain){  
  let dbconnection = companybase + domain;
  let companyDB = dataObject[domain];
  if (companyDB === undefined){
    companyDB = pgp(dbconnection);
    dataObject[domain] = companyDB;
  }
  return companyDB;
}

module.exports = { getDomain,getDatabase, getDomainDB};
