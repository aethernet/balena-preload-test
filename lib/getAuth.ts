import { env } from 'process';

export interface Auth {
  username: any;
  password: any;
}

export const getAuthHeaders = (): Auth => {
  return {
    username: env.USER,
    password: env.PASSWORD
  }
}
