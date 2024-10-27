#!/bin/bash

# Update the system
sudo yum update -y

# Install Docker
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user
sudo chkconfig docker on

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install git
sudo yum install -y git

# Clone the repository
git clone https://github.com/Madushan-Jaya-Sri/Chat_bot_with_RAG_OCR.git
cd Chat_bot_with_RAG_OCR

# Install nginx
sudo yum install -y nginx

# Configure nginx
sudo bash -c 'cat > /etc/nginx/conf.d/flask_app.conf << EOL
server {
    listen 80;
    server_name 13.202.203.220;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOL'

# Start nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Build and run the Docker containers
sudo docker-compose up --build -d