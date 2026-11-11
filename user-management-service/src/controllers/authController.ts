import { Request, Response } from "express";
import { AuthService } from "../services/authServices";

export class AuthController {
  private authService: AuthService;
  constructor() {
    this.authService = new AuthService();
  }
  public createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { idToken } = req.body;
      const requestType = req.headers["account_type"] ?? "google";
      const username = req.body.username;

      if(!idToken) {
        res.status(400).json({
          success: false,
          message: "Access token required"
        });
        return;
      }
      if(!requestType || !(requestType == "apple" || requestType == "google")) {
        res.status(400).json({
          success: false,
          message: "account_type should be apple or google"
        });
        return;
      }
      const user = await this.authService.getOrCreateUser(idToken, requestType, username);
      if(!user){
        res.status(401).json({
          success: false,
          message: "Wrong Access token"
        });
        return;
      }
      res.status(200).json({
        success: true,
        message: "user details",
        data: user
      });
      return;
    } catch (error) {
      console.log("login error: ", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };
}
