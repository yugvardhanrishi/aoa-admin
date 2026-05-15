const SUPABASE_URL = "https://azdhqelzwptdyjypjkcb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6ZGhxZWx6d3B0ZHlqeXBqa2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjQwODEsImV4cCI6MjA5MTY0MDA4MX0.g6YLwLhe_pG_27FQlKgwlrDDlsqeory5s5HWSTe3nKA";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

const loginForm = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");
const errorMessage = document.getElementById("errorMessage");
const loginBtn = document.getElementById("loginBtn");

async function checkCurrentSession() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (profile && profile.role === "admin") {
      window.location.href = "/dashboard";
    } else {
      await supabaseClient.auth.signOut();
    }
  }
}

checkCurrentSession();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  errorMessage.style.display = "none";
  errorMessage.textContent = "";
  loginBtn.disabled = true;
  loginBtn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

  try {
    const { data: authData, error: authError } =
      await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
      });

    if (authError) throw authError;

    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profileError) throw profileError;

    if (profileData.role !== "admin") {
      await supabaseClient.auth.signOut();
      throw new Error(
        "Access Denied. You do not have administrator privileges.",
      );
    }

    window.location.href = "/dashboard";
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.style.display = "block";
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Authenticate <i class="fa-solid fa-arrow-right"></i>';
  }
});
