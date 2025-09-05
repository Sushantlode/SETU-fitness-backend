# Use official Node.js image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application files
COPY . .

# Copy the .env file into the container (after copying application files)
COPY .env .env

# Expose the port your app runs on
EXPOSE 7012

# Start the app
CMD ["node", "server.js"]