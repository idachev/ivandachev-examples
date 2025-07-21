#!/bin/bash
[ "$1" = -x ] && shift && set -x
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -e

cd "${DIR}/.."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Install/update npm dependencies
echo "Installing npm dependencies..."
npm install

# Run Prettier to format all files
echo "Running Prettier formatter..."
npm run format

# Run ESLint to fix JavaScript files
echo "Running ESLint for JavaScript files..."
npm run lint:fix

# Run Stylelint to fix CSS files
echo "Running Stylelint for CSS files..."
npm run lint:fix:css

echo -e "\nFormatting complete!"
