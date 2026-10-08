const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

async function signingTemplateFixture() {
    assert.equal(process.env.LEGAL_DB_QA,'true');assert.equal(process.env.DB_HOST,'127.0.0.1');
    assert.equal(process.env.DB_PORT,process.env.CANDIDATE_DB_PORT);assert.equal(process.env.DB_NAME,'legal_e2e_qa');
    const pool = require('../../config/db');const { PDFDocument,degrees } = require('pdf-lib');
    const pdf=await PDFDocument.create();const page=pdf.addPage([595,842]);page.setCropBox(20,30,550,750);page.setRotation(degrees(90));
    page.drawText('SYNTHETIC QA ONLY',{x:50,y:700});pdf.addPage([595,842]).drawText('SECOND PAGE - SYNTHETIC');
    const bytes=Buffer.from(await pdf.save());
    const users=[];
    for(const role of ['Admin','Client','Client','Client','Lawyer']) {
        const {rows}=await pool.query('INSERT INTO users(name,email,role,passwordhash) VALUES($1,$2,$3,$4) RETURNING userid,name,email,role',
            [`Synthetic ${role}`,`${crypto.randomUUID()}@example.invalid`,role,'synthetic-not-login']);users.push(rows[0]);
    }
    const key=`users/${users[0].userid}/synthetic-template.pdf`;const objects=new Map([[key,bytes]]);
    const {r2}=require('../../utils/r2');r2.send=async command=>{
        const {Key,Body}=command.input;const type=command.constructor.name;
        if(type==='PutObjectCommand'){objects.set(Key,Buffer.from(Body));return{ETag:'synthetic'};}
        if(type==='DeleteObjectCommand'){objects.delete(Key);return{};}
        assert.ok(objects.has(Key),`Owned synthetic object must exist: ${Key}`);
        if(type==='HeadObjectCommand')return{ContentLength:objects.get(Key).length,ContentType:'application/pdf'};
        assert.equal(type,'GetObjectCommand');return{Body:Readable.from(objects.get(Key)),ContentType:'application/pdf'};
    };
    const deliveries=[];const otp=[];const outbound={mode:'success'};
    require('../../services/notifications/notificationOrchestrator').notifyRecipient=async payload=>{
        deliveries.push(payload);if(outbound.mode==='throw')throw Error('Synthetic provider unknown outcome');
        return{ok:outbound.mode==='success',outcomes:{email:{attempted:!!payload.email,ok:outbound.mode==='success'},sms:{attempted:!!payload.sms,ok:outbound.mode==='success'}}};
    };
    require('../../utils/sendMessage').sendMessage=async message=>{otp.push(String(message).match(/\d{6}/)?.[0]);return{ok:true};};
    require('../../utils/smooveEmailCampaignService').sendEmailCampaign=async payload=>{
        assert.equal(payload.campaignKey,'SIGNING_OTP');otp.push(String(payload.contactFields.otp_code));return{ok:true};
    };
    require('../../lib/renderEvidencePdf').renderEvidencePdf=async()=>bytes;
    const app=require('../../app');const jwt=require('jsonwebtoken');
    const token=jwt.sign({userid:users[0].userid,role:'Admin'},process.env.JWT_SECRET);
    const definition={name:'חבילת מסמכים לבדיקה',roles:[{id:'first',name:'חותם ראשון',kind:'first'},{id:'shared',name:'חותם משותף',kind:'shared'}],
        documents:[{id:crypto.randomUUID(),name:'הסכם בדיקה',fileKey:key,fields:[
            {pageNum:1,x:50.25,y:100.5,width:160.25,height:55.75,roleId:'first',fieldType:'signature',isRequired:true},
            {pageNum:2,x:320.5,y:600.75,width:160.25,height:55.75,roleId:'shared',fieldType:'signature',isRequired:true},
        ]}],requireOtp:true,signingOrder:'parallel',completionEmail:''};
    return {pool,app,users,key,objects,deliveries,otp,token,definition,outbound};
}
module.exports={signingTemplateFixture};
