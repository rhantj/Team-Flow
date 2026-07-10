import { RouterProvider } from "react-router";
import { AuthProvider } from "./hooks/useAuth";
import { router } from "./routes/router";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
