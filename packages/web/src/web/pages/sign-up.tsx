import { useLocation } from "wouter";
import SignInPage from "./sign-in";
// Sign-up is handled via the tab on sign-in page, redirect there
export default function SignUpPage() {
  return <SignInPage />;
}
