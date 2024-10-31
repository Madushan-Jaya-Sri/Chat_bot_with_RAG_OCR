# Use Python base image
FROM python:3.11

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    default-jdk \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clear existing Python libraries
RUN if [ "$(pip freeze | wc -l)" -ne 0 ]; then pip freeze | xargs pip uninstall -y; else echo "No packages to uninstall"; fi


# Copy requirements file first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt


# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 5001

# Command to run the application
CMD ["python", "app.py"]