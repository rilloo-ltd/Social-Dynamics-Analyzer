{pkgs}: {
  channel = "stable-25.05";
  packages = [
    pkgs.nodejs_22
  ];
  idx.extensions = [
    "vscode-icons-team.vscode-icons"
  ];
  idx.previews = {
    enable = true;
    previews = {
      web = {
        command = [
          "npm"
          "run"
          "dev"
          "--"
          "-p"
          "$PORT"
          "-H"
          "0.0.0.0"
        ];
        manager = "web";
      };
    };
  };
}