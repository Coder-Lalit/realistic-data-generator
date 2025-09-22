document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('dataForm');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const loadingSection = document.getElementById('loadingSection');
    const resultSection = document.getElementById('resultSection');
    const errorSection = document.getElementById('errorSection');
    const jsonOutput = document.getElementById('jsonOutput');
    const recordCount = document.getElementById('recordCount');
    const dataSize = document.getElementById('dataSize');
    const errorMessage = document.getElementById('errorMessage');

    let generatedData = null;
    let config = null;

    // Fetch configuration on page load
    fetchConfig();

    // Add event listener for automatic field adjustment when nested objects change
    const numObjectsInput = document.getElementById('numObjects');
    const nestedFieldsInput = document.getElementById('nestedFields');
    const numNestingInput = document.getElementById('numNesting');
    
    if (numObjectsInput && nestedFieldsInput && numNestingInput) {
        numObjectsInput.addEventListener('input', function() {
            const numObjects = parseInt(this.value) || 0;
            
            if (numObjects === 0) {
                // If no nested objects, set both nested fields and nesting depth to 0
                nestedFieldsInput.value = 0;
                numNestingInput.value = 0;
            }
        });
    }

    // Form submission handler
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            numFields: parseInt(document.getElementById('numFields').value) || 0,
            numObjects: parseInt(document.getElementById('numObjects').value) || 0,
            numNesting: parseInt(document.getElementById('numNesting').value) || 0,
            numRecords: parseInt(document.getElementById('numRecords').value) || 0,
            nestedFields: parseInt(document.getElementById('nestedFields').value) || 0,
            uniformFieldLength: document.getElementById('uniformFieldLength').checked
        };

        // Validate input using dynamic configuration
        if (!config) {
            showError('Configuration not loaded. Please refresh the page.');
            return;
        }

        const limits = config.limits;

        if (formData.numFields < limits.numFields.min || formData.numFields > limits.numFields.max) {
            showError(`Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}`);
            return;
        }

        if (formData.numObjects < limits.numObjects.min || formData.numObjects > limits.numObjects.max) {
            showError(`Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}`);
            return;
        }

        if (formData.numNesting < limits.numNesting.min || formData.numNesting > limits.numNesting.max) {
            showError(`Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}`);
            return;
        }

        if (formData.numRecords < limits.numRecords.min || formData.numRecords > limits.numRecords.max) {
            showError(`Number of records must be between ${limits.numRecords.min} and ${limits.numRecords.max}`);
            return;
        }

        if (formData.nestedFields < limits.nestedFields.min || formData.nestedFields > limits.nestedFields.max) {
            showError(`Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}`);
            return;
        }

        // Performance validation removed - no limits on total fields

        await generateData(formData);
    });

    // Copy button handler
    copyBtn.addEventListener('click', function() {
        if (generatedData) {
            const jsonString = JSON.stringify(generatedData, null, 2);
            
            if (navigator.clipboard) {
                navigator.clipboard.writeText(jsonString).then(() => {
                    showTemporaryMessage(copyBtn, '✅ Copied!', 2000);
                });
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = jsonString;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showTemporaryMessage(copyBtn, '✅ Copied!', 2000);
            }
        }
    });

    // Download button handler
    downloadBtn.addEventListener('click', function() {
        if (generatedData) {
            const jsonString = JSON.stringify(generatedData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `generated-data-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showTemporaryMessage(downloadBtn, '✅ Downloaded!', 2000);
        }
    });

    // Generate data function
    async function generateData(formData) {
        showLoading();
        
        try {
            const response = await fetch('/generate-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                generatedData = result.data;
                displayResult(generatedData);
            } else {
                showError(result.error || 'An error occurred while generating data');
            }
        } catch (error) {
            showError('Network error: ' + error.message);
        }
    }

    // Display result function
    function displayResult(data) {
        hideAllSections();
        
        // Format and display JSON with syntax highlighting
        const formattedJson = syntaxHighlight(JSON.stringify(data, null, 2));
        jsonOutput.innerHTML = formattedJson;
        
        // Update stats
        recordCount.textContent = `${data.length} records`;
        const jsonSize = new Blob([JSON.stringify(data)]).size;
        dataSize.textContent = formatBytes(jsonSize);
        
        // Show result section and action buttons
        resultSection.style.display = 'block';
        copyBtn.style.display = 'flex';
        downloadBtn.style.display = 'flex';
    }

    // Show loading state
    function showLoading() {
        hideAllSections();
        loadingSection.style.display = 'block';
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="btn-icon">⏳</span>Generating...';
    }

    // Show error message
    function showError(message) {
        hideAllSections();
        errorMessage.textContent = message;
        errorSection.style.display = 'block';
        resetGenerateButton();
    }

    // Hide all sections
    function hideAllSections() {
        loadingSection.style.display = 'none';
        resultSection.style.display = 'none';
        errorSection.style.display = 'none';
        copyBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        resetGenerateButton();
    }

    // Reset generate button
    function resetGenerateButton() {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span class="btn-icon">🎯</span>Generate Data';
    }

    // Format bytes function
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Syntax highlighting function
    function syntaxHighlight(json) {
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    // Show temporary message on button
    function showTemporaryMessage(button, message, duration) {
        const originalContent = button.innerHTML;
        button.innerHTML = message;
        button.disabled = true;
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.disabled = false;
        }, duration);
    }

    // Fetch configuration from server
    async function fetchConfig() {
        try {
            const response = await fetch('/config');
            const result = await response.json();
            
            if (response.ok && result.success) {
                config = result.config;
                updateFormLimits();
            } else {
                console.error('Failed to fetch configuration:', result.error);
                // Use fallback configuration
                config = {
                    limits: {
                        numFields: { min: 1, max: 300, default: 5 },
                        numObjects: { min: 0, max: 10, default: 1 },
                        numNesting: { min: 0, max: 5, default: 1 },
                        numRecords: { min: 1, max: 10000, default: 10 },
                        nestedFields: { min: 0, max: 50, default: 3 }
                    }
                };
            }
        } catch (error) {
            console.error('Error fetching configuration:', error);
            // Use fallback configuration
            config = {
                limits: {
                    numFields: { min: 1, max: 300, default: 5 },
                    numObjects: { min: 0, max: 10, default: 1 },
                    numNesting: { min: 0, max: 5, default: 1 },
                    numRecords: { min: 1, max: 10000, default: 10 },
                    nestedFields: { min: 0, max: 50, default: 3 }
                }
            };
        }
    }

    // Update form input limits and placeholders
    function updateFormLimits() {
        if (!config) return;

        const limits = config.limits;
        
        // Update input attributes
        const numFieldsInput = document.getElementById('numFields');
        const numObjectsInput = document.getElementById('numObjects');
        const numNestingInput = document.getElementById('numNesting');
        const numRecordsInput = document.getElementById('numRecords');

        if (numFieldsInput) {
            numFieldsInput.min = limits.numFields.min;
            numFieldsInput.max = limits.numFields.max;
            numFieldsInput.placeholder = `Default: ${limits.numFields.default}`;
        }

        if (numObjectsInput) {
            numObjectsInput.min = limits.numObjects.min;
            numObjectsInput.max = limits.numObjects.max;
            numObjectsInput.placeholder = `Default: ${limits.numObjects.default}`;
        }

        if (numNestingInput) {
            numNestingInput.min = limits.numNesting.min;
            numNestingInput.max = limits.numNesting.max;
            numNestingInput.placeholder = `Default: ${limits.numNesting.default}`;
        }

        if (numRecordsInput) {
            numRecordsInput.min = limits.numRecords.min;
            numRecordsInput.max = limits.numRecords.max;
            numRecordsInput.placeholder = `Default: ${limits.numRecords.default}`;
        }

        const nestedFieldsInput = document.getElementById('nestedFields');
        if (nestedFieldsInput) {
            nestedFieldsInput.min = limits.nestedFields.min;
            nestedFieldsInput.max = limits.nestedFields.max;
            nestedFieldsInput.placeholder = `Default: ${limits.nestedFields.default}`;
        }

        // Update helper text with actual limits
        const fieldsHelp = document.getElementById('fieldsHelp');
        if (fieldsHelp) {
            fieldsHelp.textContent = `Range: ${limits.numFields.min}-${limits.numFields.max} | Default: ${limits.numFields.default}`;
        }

        const objectsHelp = document.getElementById('objectsHelp');
        if (objectsHelp) {
            objectsHelp.textContent = `Range: ${limits.numObjects.min}-${limits.numObjects.max} | Default: ${limits.numObjects.default}`;
        }

        const nestingHelp = document.getElementById('nestingHelp');
        if (nestingHelp) {
            nestingHelp.textContent = `Range: ${limits.numNesting.min}-${limits.numNesting.max} | Default: ${limits.numNesting.default}`;
        }

        const recordsHelp = document.getElementById('recordsHelp');
        if (recordsHelp) {
            recordsHelp.textContent = `Range: ${limits.numRecords.min}-${limits.numRecords.max} | Default: ${limits.numRecords.default}`;
        }

        const nestedFieldsHelp = document.getElementById('nestedFieldsHelp');
        if (nestedFieldsHelp) {
            nestedFieldsHelp.textContent = `Range: ${limits.nestedFields.min}-${limits.nestedFields.max} | Default: ${limits.nestedFields.default}`;
        }
    }
}); 