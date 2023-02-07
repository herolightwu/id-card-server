const dbAuth = require("./dbAuth");

function authUser(req, res, next){
    if (req.user === null) {
        res.status(403)
        return res.send ('You need to sign in')
    }
    next()
}


function authRole(currentrole){
    switch(currentrole){
        case dbAuth.ROLE.ADMIN:
            return dbAuth.ACCESSLEVEL.ADMIN;
            break;
        case dbAuth.ROLE.PROGRAMMANAGER:
            return dbAuth.ACCESSLEVEL.PROGRAMMANAGER;
            break;
        case dbAuth.ROLE.USER:
            return dbAuth.ACCESSLEVEL.USER;
            break;
        case dbAuth.ROLE.CARDHOLDER:
            return dbAuth.ACCESSLEVEL.CARDHOLDER;
            break;  
        default:
            return dbAuth.ACCESSLEVEL.CARDHOLDER;                   
    }
}

function checkClientRole(clientrole,accessLevel){
    switch(accessLevel){
        case dbAuth.ACCESSLEVEL.ADMIN:
            return true;
            break;
        case dbAuth.ACCESSLEVEL.PROGRAMMANAGER:
            if (authRole(clientrole) >=2){
                return true;
            }else{
                return false;
            }
            break;
        case  dbAuth.ACCESSLEVEL.USER:
            if (authRole(clientrole) > 3){
                return true;
            }else{
                return false;
            }
        case dbAuth.ROLE.CARDHOLDER:
            return false;
            break;  
        default:
            return false;                   
    }
}



module.exports = {
    authUser,
    authRole,
    checkClientRole
}