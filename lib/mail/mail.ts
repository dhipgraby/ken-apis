import { EmailActionType, EmailActions } from "apps/auth/src/users/dto/reset-password.dto";
import { Resend } from "resend";
import * as dotenv from 'dotenv';
import { HttpException, HttpStatus } from "@nestjs/common";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const domain = process.env.VENDORS_PORTAL;

const emailFooter = `
  <small>
      Company: Trade Invx Ltd.
      <br/>
      Commercial register number: 207649559
      <br/>
      Head office and registered office: Vitosha Street No. 4, Sredets district, Sofia 1000, Bulgaria.</small>`;

const emailLogo = `<img alt="KenLogo" src="https://keneth.dev/_next/image?url=%2FKenlogo.png&w=256&q=75" width="150px" />`;

export const adminWithdrawEmail = async (
  email: string,
  summary: string,
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken Admin <contact@Ken.cc>`,
      to: email,
      subject: "Withdrawal Process Summary",
      html: `
      ${emailLogo}
      ${summary}
      ${emailFooter}
      `
    });

    console.log('Admin summary sent: ', email);
    if (sending.error !== null) throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  } catch (error) {
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  }
};

export const sendTwoFactorTokenEmail = async (
  email: string,
  token: number,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "2FA authentication Code",
      html: `
      ${emailLogo}
      <br/>
      <p>You have requested a two factor authentication action by https://${platform}</p>
      <p>Your 2FA code: <b>${token}</b></p>
      <p>This code will expire in 5 minutes.</p>
      <br/>
      ${emailFooter}
      `
    });

    console.log('2FA email sent to: ', email);
    if (sending.error !== null) throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  } catch (error) {
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  }
};

export const sendVerificationEmail = async (
  email: string,
  token: string,
  action: EmailActionType
) => {
  try {
    let subject;
    let htmlContent;
    if (action === EmailActions.EMAIL_VERIFICATION) {
      const confirmLink = `${domain}/auth/new-verification?token=${token}`;
      subject = "Ken Vendors Portal - Confirm your email";
      htmlContent = `
        ${emailLogo}
        <br/>
        <p>Click <a href="${confirmLink}">here</a> to confirm your email.</p>
        <br/>
        ${emailFooter}
      `;
    } else if (action === EmailActions.PASSWORD_RESET) {
      const confirmLink = `${domain}/auth/new-password?token=${token}`;
      subject = "Ken Vendors Portal - Confirm password reset Token";
      htmlContent = `
        ${emailLogo}
        <br/>
        <p>Click <a href="${confirmLink}">here</a> to confirm your email.</p>
        <br/>
        ${emailFooter}
      `;
    } else {
      throw new HttpException("Email action not allowed", HttpStatus.BAD_REQUEST);
    }

    const sending = await resend.emails.send({
      from: `Ken Vendors Portal <contact@Ken.cc>`,
      to: email,
      subject: subject,
      html: htmlContent
    });

    console.log('Verification email sent to: ', email);
    if (sending.error !== null) throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  } catch (error) {
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  }
};

export const sendDepositRequestEmail = async (
  email: string,
  message: string,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "Deposit Information Request from Ken",
      html: `
      ${emailLogo}
      <br/>
      <p>Dear User,</p>
      <p>We have received your request for deposit information through our platform: <a href="https://${platform}">https://${platform}</a>.</p>
      <p>Below is the message from our support team regarding your request:</p>
      <p><b>${message}</b></p>
      <br />
      <p>You can send the requested information to this email contact@Ken.cc</p>
      <p>If you have any further questions or need additional assistance, please reply to this email or contact us at <a href="mailto:contact@Ken.cc">contact@Ken.cc</a>.</p>            
      ${emailFooter}
      `
    });

    console.log('Deposit request email sent to: ', email);
    if (sending.error !== null) {
      throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error('Failed to send deposit request email:', error);
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
  }
};

export const sendDepositDenialEmail = async (
  email: string,
  message: string,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "Deposit Request Denied by Ken",
      html: `
      ${emailLogo}
      <br/>
      <p>Dear User,</p>
      <p>We regret to inform you that your deposit request submitted through our platform: <a href="https://${platform}">https://${platform}</a> has been denied.</p>
      <p>Reason for denial:</p>
      <p><b>${message}</b></p>
      <br />
      <p>If you have any further questions or need additional clarification, please reply to this email or contact us at <a href="mailto:contact@Ken.cc">contact@Ken.cc</a>.</p>
      <br/>
      ${emailFooter}
      `
    });

    console.log('Deposit denial email sent to: ', email);
    if (sending.error !== null) {
      throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error('Failed to send deposit denial email:', error);
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
  }
};

export const sendDepositApprovalEmail = async (
  email: string,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "Deposit Request Approved by Ken",
      html: `
      ${emailLogo}
      <br/>
      <p>Dear User,</p>
      <p>We are pleased to inform you that your deposit request submitted through our platform: <a href="https://${platform}">https://${platform}</a> has been approved.</p>
      <p>Your deposit will be processed shortly. If you have any further questions or need additional information, please reply to this email or contact us at <a href="mailto:contact@Ken.cc">contact@Ken.cc</a>.</p>
      <br/>
      ${emailFooter}
      `
    });

    console.log('Deposit approval email sent to: ', email);
    if (sending.error !== null) {
      throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error('Failed to send deposit approval email:', error);
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
  }
};

export const sendAccountApprovalEmail = async (
  email: string,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "Account Approved by Ken",
      html: `
      ${emailLogo}
      <br/>
      <p>Dear User,</p>
      <p>We are pleased to inform you that your account registration on our platform: <a href="https://${platform}">https://${platform}</a> has been approved.</p>
      <p>You can now log in and start using our services. If you have any further questions or need additional information, please reply to this email or contact us at <a href="mailto:contact@Ken.cc">contact@Ken.cc</a>.</p>
      <br/>
      ${emailFooter}
      `
    });

    console.log('Account approval email sent to: ', email);
    if (sending.error !== null) {
      throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error('Failed to send account approval email:', error);
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
  }
};

export const sendBanNotificationEmail = async (
  email: string,
  message: string,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "Account Ban Notification from Ken",
      html: `
      ${emailLogo}
      <br/>
      <p>Dear User,</p>
      <p>We regret to inform you that your account on our platform, <a href="https://${platform}">https://${platform}</a>, has been banned.</p>
      <p>Reason for the ban:</p>
      <p><b>${message}</b></p>
      <br />
      <p>If you believe this is a mistake or if you have any questions, please reply to this email or contact us at <a href="mailto:contact@Ken.cc">contact@Ken.cc</a>.</p>
      <br/>
      ${emailFooter}
      `
    });

    console.log('Ban notification email sent to: ', email);
    if (sending.error !== null) {
      throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error('Failed to send ban notification email:', error);
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
  }
};

export const sendInformationRequestEmail = async (
  email: string,
  message: string,
  platform: string
) => {
  try {
    const sending = await resend.emails.send({
      from: `Ken ${platform} <contact@Ken.cc>`,
      to: email,
      subject: "Request for Additional Information from Ken",
      html: `
      ${emailLogo}
      <br/>
      <p>Dear User,</p>
      <p>We need additional information regarding your recent activity on our platform: <a href="https://${platform}">https://${platform}</a>.</p>
      <p>Request details:</p>
      <p><b>${message}</b></p>
      <br />
      <p>Please provide the requested information by replying to this email or contacting us at <a href="mailto:contact@Ken.cc">contact@Ken.cc</a>.</p>
      <p>If you have any further questions, feel free to reach out to us.</p>
      <br/>
      ${emailFooter}
      `
    });

    console.log('Information request email sent to: ', email);
    if (sending.error !== null) {
      throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error('Failed to send information request email:', error);
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST);
  }
};
