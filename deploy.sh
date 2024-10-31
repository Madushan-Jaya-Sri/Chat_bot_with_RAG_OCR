#!/bin/bash
set -e  # Exit on error

# Update system packages
sudo yum update -y || {
    echo "Failed to update system packages"
    exit 1
}

# Install Docker
if ! command -v docker &> /dev/null; then
    sudo yum install -y docker || {
        echo "Failed to install Docker"
        exit 1
    }
    sudo service docker start
    sudo usermod -a -G docker ec2-user
    sudo chkconfig docker on
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Create nginx directory and copy config
mkdir -p nginx
sudo cp ~/app/nginx/nginx.conf /etc/nginx/nginx.conf

# Deploy application
sudo docker-compose down || true  # Don't fail if containers don't exist
sudo docker system prune -f  # Clean up unused resources
sudo docker-compose build --no-cache
sudo docker-compose up -d

echo "Deployment completed successfully"