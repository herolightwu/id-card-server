// company database
// const companyLOCAL =
//   "postgres://idcardapp:Xe9Rzi8gfoaKNVgkeoGsPVczNPMN8TD4@192.168.1.3:5432/";
const companyLOCAL = 'postgres://postgres:000000@localhost:5432/';  
const companyDEV =
  "postgres://idcardapp:Xe9Rzi8gfoaKNVgkeoGsPVczNPMN8TD4@db.idcard.dev.veritecinc.com:5432/";
const companyPROD = "";

// idcard database
// const idcardLOCAL =
//   "postgres://idcardapp:Xe9Rzi8gfoaKNVgkeoGsPVczNPMN8TD4@192.168.1.3:5432/idcarddb";
  const idcardLOCAL =
  "postgres://postgres:000000@localhost:5432/idcarddb";  
const idcardDEV =
  "postgres://idcardapp:Xe9Rzi8gfoaKNVgkeoGsPVczNPMN8TD4@db.idcard.dev.veritecinc.com:5432/idcarddb";
const idcardPROD = "";

// admin database
// const adminLOCAL =
//   "postgres://idcardapp:Xe9Rzi8gfoaKNVgkeoGsPVczNPMN8TD4@192.168.1.3:5432/vrtc";
const adminLOCAL =
  "postgres://postgres:000000@localhost:5432/vrtc";
const adminDEV =
  "postgres://idcardapp:Xe9Rzi8gfoaKNVgkeoGsPVczNPMN8TD4@db.idcard.dev.veritecinc.com:5432/vrtc";
const adminPROD = "";

// set environment options
const company_base = companyLOCAL;
const idcard_db = idcardLOCAL;
const admin_db = adminLOCAL;
const ROLE = {
  ADMIN: "Administrator",
  PROGRAMMANAGER: "Program Manager",
  USER: "User",
  CARDHOLDER: "CardHolder",
};
const ACCESSLEVEL = {
  ADMIN: 1,
  PROGRAMMANAGER: 2,
  USER: 3,
  CARDHOLDER: 4,
};

const permissions = {
  cards_read: false,
  cards_order: false,
  cards_edit: false,
  cards_print: false,
  cards_reject: false,
  nfc_write: false,
};

const userprogram = {
  program1: false,
  program2: false,
  program3: false,
  program4: false,
  program5: false,
  program6: false,
  program7: false,
  program8: false,
  program9: false,
  program10: false,
};

module.exports = {
  company_base,
  idcard_db,
  admin_db,
  ROLE,
  ACCESSLEVEL,
  permissions,
  userprogram,
};
