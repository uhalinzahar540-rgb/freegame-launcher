fn main() {
    println!("cargo:rerun-if-env-changed=FGL_UPDATE_URL");
    println!("cargo:rerun-if-changed=../public/catalog/opensource.json");
    tauri_build::build()
}
