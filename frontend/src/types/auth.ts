export type GoogleUser = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
};

export type GoogleSession = {
  user: GoogleUser;
  idToken: string;
};

export type LoginResponse = {
  success: boolean;
  message?: string;
  data?: {
    address?: string;
    solanaAddress?: string;
    ethereumAddress?: string;
    email: string;
    name: string | null;
    formFilled: boolean;
  };
};
