export enum EmailActions {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'reset_password',
  PASSWORD_SET = 'set_password',
  TWO_FACTOR_LOGIN = 'twofactor_login',
}

export type EmailActionType =
  | EmailActions.EMAIL_VERIFICATION
  | EmailActions.PASSWORD_RESET
  | EmailActions.PASSWORD_SET
  | EmailActions.TWO_FACTOR_LOGIN;
