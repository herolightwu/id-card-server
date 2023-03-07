const express = require("express");
const router = express.Router();
const authUser = require("../server/userAuth");
const queries = require("../server/queries");
const ROLE = require("../server/dbAuth");
const cors = require("cors");

router.get("/api/apikey", cors(), queries.getDatabaseAPIKey);
router.get("/api/email", cors(), queries.getDatabaseEmail);

// users
router.get("/api/users/:id", cors(), queries.getUserByID);
router.post("/api/users", cors(), queries.createUser);
router.put("/api/users/:id", cors(), queries.updateUser);
router.put("/api/users/", cors(), queries.updateUserByEmail);
router.put("/api/admin/users/:id", cors(), queries.updateUserByAdmin);

router.get("/api/usersrange", cors(), queries.getUsersByRange);
router.get("/api/usersemail", cors(), queries.getUsersByEmail);
router.get("/api/users", cors(), queries.getAllUsers);
router.put(
  "/api/password/:id",
  cors(),
  queries.verifyUserPassword,
  queries.changeUserPassword
);
router.put("/api/forgotpassword", cors(), queries.forgotPassword);
router.put("/api/userEnabled/:id", cors(), queries.userEnabled);
router.put("/api/deleteuser/:id", cors(), queries.deleteUser);

router.post("/api/admin/users", cors(), queries.getUsersOnAdmin);
router.put("/api/admin/deleteuser/:id", cors(), queries.deleteUserByAdmin);

// card programs
router.get("/api/cardprogram/:id", cors(), queries.getCardProgrambyID);
router.post("/api/cardprogram", cors(), queries.createCardProgram);
router.put("/api/cardprogram", cors(), queries.editCardProgram);
router.put("/api/programenabled/:id", cors(), queries.programEnabled);
router.post("/api/allcardprograms", cors(), queries.getAllCardPrograms);
router.post("/api/availablecards", cors(), queries.addAvailableCards);
router.put("/api/deleteprogram/:id", cors(), queries.deleteProgram);

// cards
router.get("/api/cards", cors(), queries.getAllCards);
router.get("/api/cards/:id", cors(), queries.getCardByID);
router.get("/api/cardsrange", cors(), queries.getCardsByRange);
router.post("/api/cards", cors(), queries.orderCard);
router.put("/api/cards", cors(), queries.editCard);
router.put("/api/cards/:id", cors(), queries.setCardStatus);
router.get("/api/cardid/:uid", cors(), queries.getCardIDByUid);
router.put("/api/deletecard/:id", cors(), queries.deleteCard);
// scandata
router.get("/api/scandata", cors(), queries.getAllScanData);
router.post("/api/scandata", cors(), queries.scanCard);
// user login logout

router.post("/api/login", cors(), queries.userLogin);
router.post("/api/logout", cors(), queries.userLogout);
router.post("/api/encode", cors(), queries.Encode);
router.post("/api/decode", cors(), queries.Decode);
//token
// router.get("/api/token", queries.checkUserID);

//Image Compress
router.post("/api/compress_image", cors(), queries.compress_image);
router.post("/api/compress_image_filename", cors(), queries.compress_image_filename);

// Reference Programs anf Permission List
router.get("/api/allprograms", cors(), queries.getProgramList);
router.get("/api/allpermissions", cors(), queries.getPermissionList);

//generate pdf for virtual card and print
router.post("/api/generate_card", cors(), queries.generateVCard);

//send password email
router.post("/api/sendemail", cors(), queries.sendEmailAPI);

//vrtc-licenses
router.get("/api/licenses", cors(), queries.getLicenses);
router.get("/api/licenses/:id", cors(), queries.getLicense);
router.post("/api/licenses", cors(), queries.addLicense);
router.put("/api/licenses", cors(), queries.editLicense);
router.post("/api/increaseCardCount", cors(), queries.increaseCardCount);
router.post("/api/getLicense", cors(), queries.getLicenseByDomain);
router.put("/api/deletelicense", cors(), queries.deleteLicense);

//vrtc-domainlist
router.get("/api/domains", cors(), queries.getDomains);
router.post("/api/domains", cors(), queries.createDomain);
router.put("/api/domains", cors(), queries.editDomain);
router.post("/api/templatelist", cors(), queries.getTemplatelist);
router.put("/api/deletedomain", cors(), queries.deleteDomain);

//Batch order
router.post("/api/batchtemplate", cors(), queries.makeCsvTemplate);
router.get("/api/csvdownload/:filename", cors(), queries.downloadCsvTemplate)
router.post("/api/uploadzip", cors(), queries.uploadZip);

module.exports = router;
