// Global variables
let chatHistory = [];
let currentConversationId = null;

// Initialize the chat interface
document.addEventListener('DOMContentLoaded', function () {
    loadChatHistory();
    initializeChatForm();

    // Add event listener for new chat button
    document.querySelector('[onclick="newChat()"]').addEventListener('click', newChat);
});

// Initialize chat form
function initializeChatForm() {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('userInput');
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = input.value.trim();

        if (message) {
            // Disable input and button while processing
            input.disabled = true;
            submitButton.disabled = true;

            // Hide templates when starting a chat
            const templates = document.getElementById('initialTemplates');
            if (templates) {
                templates.style.display = 'none';
            }

            try {
                await sendMessage(message);
            } catch (error) {
                console.error('Error sending message:', error);
                appendMessage('Sorry, there was an error sending your message. Please try again.', 'error');
            } finally {
                // Re-enable input and button
                input.disabled = false;
                submitButton.disabled = false;
                input.value = '';
                input.focus();
            }
        }
    });
}


async function appendMessage(message, type) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message opacity-0 transition-opacity duration-300 mx-4 my-2`;

    // Add max-width constraint to message containers
    const messageContainer = document.createElement('div');
    messageContainer.className = 'max-w-2xl mx-auto';

    switch (type) {
        case 'user':
            messageDiv.classList.add('bg-blue-100', 'text-blue-900', 'rounded-lg', 'p-3', 'mb-2', 'ml-auto');
            messageContainer.innerHTML = escapeHtml(message);
            messageDiv.style.maxWidth = '80%';
            break;
            
        case 'bot':
            messageDiv.classList.add('bg-white', 'shadow-md', 'rounded-lg', 'p-4', 'mb-2');
            messageDiv.style.maxWidth = '90%';
            
            // Create typing effect container
            const typingContainer = document.createElement('div');
            const penIconContainer = document.createElement('div');
            penIconContainer.className = 'flex items-center gap-2 mb-2 text-gray-500';
            penIconContainer.innerHTML = `
                <svg class="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span class="text-sm">Generating...</span>
            `;
            messageContainer.appendChild(penIconContainer);
            messageContainer.appendChild(typingContainer);
            
            // Format and type the message
            const formattedMessage = formatBotMessage(message);
            let currentIndex = 0;
            
            const typing = async () => {
                if (currentIndex < formattedMessage.length) {
                    typingContainer.innerHTML = formattedMessage.slice(0, currentIndex + 1);
                    currentIndex++;
                    await new Promise(resolve => setTimeout(resolve, 0.5));
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    requestAnimationFrame(typing);
                } else {
                    penIconContainer.remove();
                    
                    // Initialize charts after typing is complete
                    messageDiv.querySelectorAll('.chart-container').forEach(container => {
                        try {
                            if (window.ReactDOM && window.ChartDisplay) {  // Check if React and ChartDisplay component are available
                                const chartData = JSON.parse(container.dataset.chart);
                                const chartRoot = document.createElement('div');
                                container.appendChild(chartRoot);
                                
                                ReactDOM.render(
                                    React.createElement(ChartDisplay, {
                                        chartData: chartData.data,
                                        chartType: chartData.type
                                    }),
                                    chartRoot
                                );
                            }
                        } catch (e) {
                            console.error('Failed to render chart:', e);
                        }
                    });
                }
            };
            await typing();
            break;
            
        case 'error':
            messageDiv.classList.add('bg-red-100', 'text-red-900', 'rounded-lg', 'p-3', 'mb-2');
            messageDiv.style.maxWidth = '80%';
            messageContainer.innerHTML = escapeHtml(message);
            break;
    }

    messageDiv.appendChild(messageContainer);
    chatMessages.appendChild(messageDiv);
    
    // Ensure proper scrolling
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    
    await new Promise(resolve => setTimeout(resolve, 2));
    messageDiv.classList.add('opacity-100');
}

// Send message to the server
async function sendMessage(message) {
    // Add user message to chat with typing animation
    appendMessage(message, 'user');

    // Show loading indicator
    showLoading();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: message,
                chat_history: chatHistory,
                conversation_id: currentConversationId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Remove loading indicator
        hideLoading();

        if (data.error) {
            appendMessage('Sorry, there was an error processing your request.', 'error');
        } else {
            // Add bot response with typing animation
            appendMessage(data.response, 'bot');

            // Update chat history
            chatHistory.push({
                question: message,
                answer: data.response
            });

            // Update conversation ID and reload chat history
            if (data.conversation_id) {
                currentConversationId = data.conversation_id;
                await loadChatHistory();
            }
        }
    } catch (error) {
        hideLoading();
        appendMessage('Sorry, there was an error connecting to the server.', 'error');
        console.error('Error:', error);
    }
}

// Load chat history with error handling and retry mechanism
async function loadChatHistory(retryCount = 3) {
    const chatHistoryDiv = document.getElementById('chatHistory');

    for (let i = 0; i < retryCount; i++) {
        try {
            const response = await fetch('/chat_history');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const history = await response.json();

            // Clear existing history
            chatHistoryDiv.innerHTML = '';

            // Add history items with fade-in animation
            history.forEach((chat, index) => {
                const chatDiv = document.createElement('div');
                chatDiv.className = 'chat-history-item p-2 hover:bg-gray-700 rounded cursor-pointer opacity-0 transition-opacity duration-300';
                chatDiv.style.animationDelay = `${index * 50}ms`;

                chatDiv.innerHTML = `
                    <div class="font-medium truncate">${escapeHtml(chat.title)}</div>
                    <div class="text-sm text-gray-400 truncate">${escapeHtml(chat.preview)}</div>
                    <div class="text-xs text-gray-500">${formatTimestamp(chat.timestamp)}</div>
                `;

                chatDiv.addEventListener('click', () => loadConversation(chat.id));

                chatHistoryDiv.appendChild(chatDiv);

                // Trigger fade-in
                setTimeout(() => {
                    chatDiv.classList.add('opacity-100');
                }, 50);
            });

            return; // Success, exit retry loop
        } catch (error) {
            console.error(`Error loading chat history (attempt ${i + 1}):`, error);
            if (i === retryCount - 1) {
                // Show error message on final retry
                chatHistoryDiv.innerHTML = `
                    <div class="text-red-500 p-2">
                        Failed to load chat history. Please refresh the page.
                    </div>`;
            }
        }
    }
}

// Load a specific conversation
async function loadConversation(conversationId) {
    try {
        const response = await fetch(`/conversation/${conversationId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const conversation = await response.json();

        // Clear current chat
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';

        // Update global variables
        currentConversationId = conversationId;
        chatHistory = [];

        // Hide templates
        const templates = document.getElementById('initialTemplates');
        if (templates) {
            templates.style.display = 'none';
        }

        // Display conversation messages with typing animation
        for (const msg of conversation.messages) {
            await appendMessage(msg.question, 'user');
            await appendMessage(msg.answer, 'bot');
            chatHistory.push(msg);
        }

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error loading conversation:', error);
        appendMessage('Failed to load conversation. Please try again.', 'error');
    }
}

// Start new chat with animation
function newChat() {
    const chatMessages = document.getElementById('chatMessages');

    // Fade out existing messages
    chatMessages.style.opacity = '0';

    setTimeout(() => {
        // Reset state
        chatHistory = [];
        currentConversationId = null;
        chatMessages.innerHTML = '';
        document.getElementById('userInput').value = '';

        // Show templates
        const templates = document.getElementById('initialTemplates');
        if (templates) {
            templates.style.display = 'flex';
        }

        // Fade in new content
        chatMessages.style.opacity = '1';
    }, 300);
}

// Load template question
function loadTemplate(template) {
    const input = document.getElementById('userInput');
    input.value = template;
    input.focus();
    document.getElementById('chatForm').dispatchEvent(new Event('submit'));
}





function formatBotMessage(message) {

    
    // Check for chart data in the message
    const chartRegex = /<chart>([\s\S]*?)<\/image>/g;
    let formattedMessage = message;
    
    // Replace chart tags with chart container divs
    formattedMessage = formattedMessage.replace(chartRegex, (match, chartContent) => {
        try {
            const chartData = JSON.parse(chartContent);
            return `<div class="chart-container" data-chart='${JSON.stringify(chartData)}'></div>`;
        } catch (e) {
            console.error('Failed to parse chart data:', e);
            return '';
        }
    });



    // Format sections with better spacing and structure
    const formattedSections = message.split(/(?=Details:|Statistics:|Commentary:)/).map(section => {
        const sectionMatch = section.match(/^(Details:|Statistics:|Commentary:)([\s\S]*)/);
        if (sectionMatch) {
            const [, header, content] = sectionMatch;
            return `
                <div class="section mb-4">
                    <h3 class="font-semibold text-gray-800 mb-2">${header}</h3>
                    <div class="pl-4 border-l-2 border-gray-200" style = "border-color:#33d8c0">
                        ${formatContent(content)}
                    </div>
                </div>
            `;
        }
        return formatContent(section);
    }).join('');

    return `
        <div class="message-content space-y-3">
            ${formattedSections}
        </div>
    `;
}

function formatContent(content) {
    if (!content) return '';
    
    return content
        .trim()
        .split('\n')
        .map(line => {
            // Format bullet points
            if (line.trim().startsWith('-')) {
                return `<li class="ml-4 mb-2">${line.trim().substring(1)}</li>`;
            }
            // Format regular paragraphs
            return line.trim() ? `<p class="mb-2">${line}</p>` : '';
        })
        .join('')
        .replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul class="list-disc mb-3">$1</ul>');
}
function formatTableData(data) {
    if (!data || typeof data !== 'string') return data;
    
    // Remove empty rows and clean the data
    const rows = data.split('\n')
        .map(row => row.trim())
        .filter(row => row && !row.match(/^\|[-\s|]*\|$/));
    
    if (rows.length < 1) return data;

    // Process headers and data rows
    const processRow = row => row
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell);

    const headers = processRow(rows[0]);
    const dataRows = rows.slice(1).map(processRow);

    // Enhanced table styling
    return `
        <div class="overflow-x-auto my-4 rounded-lg shadow">
            <table class="min-w-full divide-y divide-gray-200">
                <thead>
                    <tr class="bg-gray-50">
                        ${headers.map(header => `
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                ${header}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${dataRows.map((row, rowIndex) => `
                        <tr class="${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-all">
                            ${row.map((cell, cellIndex) => `
                                <td class="px-6 py-4 whitespace-nowrap text-sm ${
                                    cellIndex === 0 
                                        ? 'font-medium text-gray-900' 
                                        : isNaN(cell) 
                                            ? 'text-gray-500' 
                                            : 'text-gray-900 font-mono'
                                }">
                                    ${isNaN(cell) ? cell : parseFloat(cell).toLocaleString()}
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
// Helper function to format individual sections
function formatSection(header, content) {
    return `
        <div class="section mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-3 flex items-center">
                <span class="mr-2">${header}</span>
                <span class="text-gray-500">:</span>
            </h2>
            <div class="pl-4 border-l-2 border-gray-200" style="border-color: #2ae47b;">
                ${formatContent(content)}
            </div>

        </div>
    `;
}


// Show loading indicator
function showLoading() {
    const chatMessages = document.getElementById('chatMessages');
    
    // Check if loading indicator already exists to avoid duplicates
    if (document.getElementById('loadingIndicator')) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator flex items-center space-x-2 p-3 mb-2';
    loadingDiv.innerHTML = `
        <div class="loading-dots flex space-x-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-higherBounce"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-higherBounce" style="animation-delay: 0.1s"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-higherBounce" style="animation-delay: 0.2s"></div>
        </div>
    `;
    loadingDiv.id = 'loadingIndicator';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Hide loading indicator
function hideLoading() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// Format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

// Escape HTML to prevent XSS attacks
function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}
