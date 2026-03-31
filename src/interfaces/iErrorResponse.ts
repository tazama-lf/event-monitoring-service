export interface ErrorResponse {
  isMatch: boolean;
  message: string;
  differences: string[];
  schema?: any;
}
