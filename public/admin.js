const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const postForm = document.getElementById("post-form");
const imageInput = document.getElementById("post-image");
const imagePreview = document.getElementById("image-preview");
const imagePreviewImage = document.getElementById("image-preview-image");
const loginMessage = document.getElementById("login-message");
const dashboardMessage = document.getElementById("dashboard-message");
const postList = document.getElementById("post-list");
const contactList = document.getElementById("contact-list");
const formTitle = document.getElementById("form-title");
let csrfToken = "";
let posts = [];
let contactSubmissions = [];
let selectedImageData = "";
let imageReadVersion = 0;

async function getCsrfToken() {
  const response = await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Güvenlik anahtarı alınamadı.");
  csrfToken = result.csrfToken;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "İstek tamamlanamadı.");
  return result;
}

function showMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
}

function resetForm() {
  postForm.reset();
  postForm.elements.id.value = "";
  imageReadVersion += 1;
  selectedImageData = "";
  renderImagePreview();
  formTitle.textContent = "Yeni yazı";
}

function renderImagePreview() {
  imagePreview.hidden = !selectedImageData;
  if (selectedImageData) imagePreviewImage.src = selectedImageData;
  else imagePreviewImage.removeAttribute("src");
}

function renderPosts() {
  postList.replaceChildren();
  if (!posts.length) {
    const empty = document.createElement("p");
    empty.textContent = "Henüz yazı eklenmemiş.";
    postList.append(empty);
    return;
  }
  for (const post of posts) {
    const row = document.createElement("article");
    row.className = "post-row";
    if (post.imageData) {
      const image = document.createElement("img");
      image.src = post.imageData;
      image.alt = post.title;
      row.append(image);
    }
    const title = document.createElement("h3");
    title.textContent = post.title;
    const excerpt = document.createElement("p");
    excerpt.textContent = post.excerpt;
    const status = document.createElement("span");
    status.className = "post-status";
    status.textContent = post.status === "published" ? "Yayımlandı" : "Taslak";
    const actions = document.createElement("div");
    actions.className = "actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Düzenle";
    edit.addEventListener("click", () => {
      postForm.elements.id.value = post._id;
      postForm.elements.title.value = post.title;
      postForm.elements.excerpt.value = post.excerpt;
      postForm.elements.content.value = post.content;
      postForm.elements.status.value = post.status;
      imageReadVersion += 1;
      selectedImageData = post.imageData || "";
      imageInput.value = "";
      renderImagePreview();
      formTitle.textContent = "Yazıyı düzenle";
      postForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Sil";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`"${post.title}" yazısı silinsin mi?`)) return;
      try {
        await apiRequest(`/api/admin/posts/${encodeURIComponent(post._id)}`, { method: "DELETE" });
        await loadPosts();
        showMessage(dashboardMessage, "Yazı silindi.", true);
      } catch (error) {
        showMessage(dashboardMessage, error.message);
      }
    });
    actions.append(edit, remove);
    row.append(title, excerpt, status, actions);
    postList.append(row);
  }
}

async function loadPosts() {
  posts = await apiRequest("/api/admin/posts");
  renderPosts();
}

function renderContactSubmissions() {
  contactList.replaceChildren();
  if (!contactSubmissions.length) {
    const empty = document.createElement("p");
    empty.textContent = "Henüz iletişim talebi yok.";
    contactList.append(empty);
    return;
  }

  for (const submission of contactSubmissions) {
    const row = document.createElement("article");
    row.className = "contact-submission";

    const header = document.createElement("div");
    header.className = "contact-submission-head";
    const name = document.createElement("h3");
    name.textContent = submission.fullName;
    const status = document.createElement("span");
    status.className = "contact-submission-status";
    status.classList.toggle("unread", !submission.isRead);
    status.textContent = submission.isRead ? "Okundu" : "Yeni";
    const received = document.createElement("time");
    received.dateTime = submission.createdAt;
    received.textContent = new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(submission.createdAt));
    header.append(name, status, received);

    const details = document.createElement("div");
    details.className = "contact-submission-meta";
    const phone = document.createElement("a");
    phone.href = `tel:${submission.phone.replace(/[^\d+]/g, "")}`;
    phone.textContent = submission.phone;
    details.append(phone);
    if (submission.email) {
      const email = document.createElement("a");
      email.href = `mailto:${submission.email}`;
      email.textContent = submission.email;
      details.append(email);
    }

    const message = document.createElement("p");
    message.className = "contact-submission-message";
    message.textContent = submission.message;
    const actions = document.createElement("div");
    actions.className = "actions";

    if (!submission.isRead) {
      const markRead = document.createElement("button");
      markRead.type = "button";
      markRead.className = "secondary";
      markRead.textContent = "Okundu işaretle";
      markRead.addEventListener("click", async () => {
        try {
          await apiRequest(`/api/admin/contact-submissions/${encodeURIComponent(submission._id)}`, {
            method: "PATCH",
            body: JSON.stringify({ isRead: true }),
          });
          await loadContactSubmissions();
        } catch (error) {
          showMessage(dashboardMessage, error.message);
        }
      });
      actions.append(markRead);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Sil";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`${submission.fullName} adlı kişinin iletişim talebi silinsin mi?`)) return;
      try {
        await apiRequest(`/api/admin/contact-submissions/${encodeURIComponent(submission._id)}`, {
          method: "DELETE",
        });
        await loadContactSubmissions();
      } catch (error) {
        showMessage(dashboardMessage, error.message);
      }
    });
    actions.append(remove);
    row.append(header, details, message, actions);
    contactList.append(row);
  }
}

async function loadContactSubmissions() {
  contactSubmissions = await apiRequest("/api/admin/contact-submissions");
  renderContactSubmissions();
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

async function initialize() {
  try {
    await getCsrfToken();
    const sessionState = await apiRequest("/api/admin/session");
    if (sessionState.authenticated) {
      showDashboard();
      await Promise.all([loadPosts(), loadContactSubmissions()]);
    } else {
      loginView.hidden = false;
    }
  } catch (error) {
    loginView.hidden = false;
    showMessage(loginMessage, error.message);
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage(loginMessage, "");
  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: loginForm.elements.password.value,
      }),
    });
    csrfToken = result.csrfToken;
    loginForm.reset();
    showDashboard();
    await Promise.all([loadPosts(), loadContactSubmissions()]);
  } catch (error) {
    showMessage(loginMessage, error.message);
  } finally {
    submit.disabled = false;
  }
});

postForm.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage(dashboardMessage, "");
  const id = postForm.elements.id.value;
  const payload = {
    title: postForm.elements.title.value,
    excerpt: postForm.elements.excerpt.value,
    content: postForm.elements.content.value,
    status: postForm.elements.status.value,
    imageData: selectedImageData,
  };
  try {
    await apiRequest(id ? `/api/admin/posts/${encodeURIComponent(id)}` : "/api/admin/posts", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    resetForm();
    await loadPosts();
    showMessage(dashboardMessage, "Yazı kaydedildi.", true);
  } catch (error) {
    showMessage(dashboardMessage, error.message);
  }
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
    imageInput.value = "";
    showMessage(dashboardMessage, "JPEG, PNG veya WebP biçiminde en fazla 2 MB bir görsel seçin.");
    return;
  }

  const version = ++imageReadVersion;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (version !== imageReadVersion) return;
    if (typeof reader.result !== "string") {
      showMessage(dashboardMessage, "Görsel okunamadı.");
      return;
    }
    selectedImageData = reader.result;
    renderImagePreview();
    showMessage(dashboardMessage, "");
  });
  reader.addEventListener("error", () => {
    if (version === imageReadVersion) showMessage(dashboardMessage, "Görsel okunamadı.");
  });
  reader.readAsDataURL(file);
});

document.getElementById("remove-image-button").addEventListener("click", () => {
  imageReadVersion += 1;
  imageInput.value = "";
  selectedImageData = "";
  renderImagePreview();
});

document.getElementById("new-post-button").addEventListener("click", resetForm);
document.getElementById("refresh-contact-button").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await loadContactSubmissions();
    showMessage(dashboardMessage, "İletişim talepleri yenilendi.", true);
  } catch (error) {
    showMessage(dashboardMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("logout-button").addEventListener("click", async () => {
  try {
    await apiRequest("/api/admin/logout", { method: "POST" });
    window.location.reload();
  } catch (error) {
    showMessage(dashboardMessage, error.message);
  }
});

initialize();
