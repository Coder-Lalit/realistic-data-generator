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
    let currentSession = null; // Store current pagination session data

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

    // Add event listener for pagination checkbox
    const enablePaginationInput = document.getElementById('enablePagination');
    const numRecordsInput = document.getElementById('numRecords');
    const numRecordsLabel = document.querySelector('label[for="numRecords"]');
    const recordsHelp = document.getElementById('recordsHelp');

    if (enablePaginationInput && numRecordsInput && numRecordsLabel && recordsHelp) {
        enablePaginationInput.addEventListener('change', function() {
            const recordsPerPageGroup = document.getElementById('recordsPerPageGroup');
            
            if (this.checked) {
                // Update range for pagination mode, keep same help text
                numRecordsInput.min = 10;
                numRecordsInput.max = 1000000;
                numRecordsInput.value = Math.max(Math.min(parseInt(numRecordsInput.value) || 100, 1000000), 10);
                recordsHelp.textContent = 'Range: 1-10000 | Default: 10';
                recordsPerPageGroup.style.display = 'block';
            } else {
                // Restore original range and help text for regular mode
                numRecordsInput.min = 1;
                numRecordsInput.max = 10000;
                numRecordsInput.value = Math.min(parseInt(numRecordsInput.value) || 10, 10000);
                recordsPerPageGroup.style.display = 'none';
                updateFormLimits(); // This will restore the original help text
                currentSession = null; // Clear session when disabling pagination
            }
        });
    }

    // Form submission handler
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const enablePagination = document.getElementById('enablePagination').checked;
        const numRecordsValue = parseInt(document.getElementById('numRecords').value) || 0;
        
        const formData = {
            numFields: parseInt(document.getElementById('numFields').value) || 0,
            numObjects: parseInt(document.getElementById('numObjects').value) || 0,
            numNesting: parseInt(document.getElementById('numNesting').value) || 0,
            numRecords: enablePagination ? null : numRecordsValue,
            totalRecords: enablePagination ? numRecordsValue : null,
            nestedFields: parseInt(document.getElementById('nestedFields').value) || 0,
            uniformFieldLength: document.getElementById('uniformFieldLength').checked,
            recordsPerPage: enablePagination ? parseInt(document.getElementById('recordsPerPage').value) || 100 : undefined,
            enablePagination: enablePagination
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

        if (!enablePagination) {
            if (numRecordsValue < limits.numRecords.min || numRecordsValue > limits.numRecords.max) {
                showError(`Number of records must be between ${limits.numRecords.min} and ${limits.numRecords.max}`);
                return;
            }
        } else {
            if (numRecordsValue < 10 || numRecordsValue > 1000000) {
                showError('Number of records must be between 10 and 1,000,000 for pagination');
                return;
            }
        }

        if (formData.nestedFields < limits.nestedFields.min || formData.nestedFields > limits.nestedFields.max) {
            showError(`Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}`);
            return;
        }

        // Enhanced validation and performance warnings
        const validationResult = validateFormData(formData, enablePagination, numRecordsValue, limits);
        if (!validationResult.isValid) {
            showError(validationResult.error);
            return;
        }

        const performanceWarnings = checkPerformanceWarnings(formData, enablePagination, numRecordsValue);
        if (performanceWarnings.length > 0) {
            const proceed = confirm(
                `⚠️ Performance Warning:\n\n${performanceWarnings.join('\n')}\n\nThis may take longer to generate. Continue?`
            );
            if (!proceed) {
                resetGenerateButton();
                return;
            }
        }

        if (enablePagination) {
            await generatePaginatedData(formData);
        } else {
            await generateData(formData);
        }
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
        const isLargeDataset = (formData.numRecords > 1000) || 
                              (formData.numFields * formData.numRecords > 5000);
        
        showLoading(isLargeDataset);
        
        let startTime = Date.now();
        let progressInterval;
        
        if (isLargeDataset) {
            // Simulate progress for large datasets
            progressInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const estimatedTotal = Math.max(2000, formData.numRecords * 2); // Rough estimate
                const progress = Math.min(90, (elapsed / estimatedTotal) * 100);
                const remainingMs = (estimatedTotal - elapsed) * (100 - progress) / progress;
                const estimate = remainingMs > 1000 ? `~${Math.ceil(remainingMs/1000)}s remaining` : 'Almost done...';
                updateProgress(progress, estimate);
            }, 200);
        }
        
        try {
            const response = await fetch('/generate-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            if (progressInterval) {
                clearInterval(progressInterval);
                updateProgress(100, 'Complete!');
            }

            const result = await response.json();

            if (response.ok && result.success) {
                generatedData = result.data;
                currentSession = null; // Clear any existing session
                
                if (isLargeDataset) {
                    // Brief delay to show completion
                    setTimeout(() => {
                        displayResult(generatedData, null);
                    }, 500);
                } else {
                    displayResult(generatedData, null);
                }
            } else {
                showError(result.error || 'An error occurred while generating data');
            }
        } catch (error) {
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            showError('Network error: ' + error.message);
        }
    }

    // Generate paginated data function
    async function generatePaginatedData(formData) {
        const isLargeDataset = formData.totalRecords > 10000;
        showLoading(isLargeDataset);
        
        let progressInterval;
        if (isLargeDataset) {
            let startTime = Date.now();
            progressInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const estimatedTotal = Math.max(3000, formData.totalRecords * 0.5);
                const progress = Math.min(90, (elapsed / estimatedTotal) * 100);
                const remainingMs = (estimatedTotal - elapsed) * (100 - progress) / progress;
                const estimate = remainingMs > 1000 ? `~${Math.ceil(remainingMs/1000)}s remaining` : 'Setting up pagination...';
                updateProgress(progress, estimate);
            }, 200);
        }
        
        try {
            const response = await fetch('/generate-paginated', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            if (progressInterval) {
                clearInterval(progressInterval);
                updateProgress(100, 'Complete!');
            }

            const result = await response.json();

            if (response.ok && result.success) {
                generatedData = result.data;
                currentSession = {
                    sessionId: result.sessionId,
                    pagination: result.pagination,
                    originalPayload: formData  // Store original form data for POST requests
                };
                
                if (isLargeDataset) {
                    setTimeout(() => {
                        displayResult(generatedData, currentSession);
                    }, 500);
                } else {
                    displayResult(generatedData, currentSession);
                }
            } else {
                showError(result.error || 'An error occurred while generating paginated data');
            }
        } catch (error) {
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            showError('Network error: ' + error.message);
        }
    }

    // Load specific page function
    async function loadPage(pageNumber) {
        if (!currentSession) {
            showError('No active pagination session');
            return;
        }

        showLoading();
        
        try {
            // Create POST payload with original form data + session ID + page number
            const pagePayload = {
                ...currentSession.originalPayload,
                sessionId: currentSession.sessionId,
                pageNumber: pageNumber
            };

            const response = await fetch('/generate-paginated', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(pagePayload)
            });
            const result = await response.json();

            if (response.ok && result.success) {
                generatedData = result.data;
                currentSession.pagination = result.pagination;
                displayResult(generatedData, currentSession);
            } else {
                showError(result.error || 'An error occurred while loading the page');
            }
        } catch (error) {
            showError('Network error: ' + error.message);
        }
    }

    // Display result function
    function displayResult(data, session = null) {
        hideAllSections();
        
        // Format and display JSON with syntax highlighting
        const formattedJson = syntaxHighlight(JSON.stringify(data, null, 2));
        jsonOutput.innerHTML = formattedJson;
        
        // Update stats
        if (session && session.pagination) {
            const { currentPage, totalPages, totalRecords, recordsInCurrentPage } = session.pagination;
            recordCount.textContent = `${recordsInCurrentPage} records (Page ${currentPage} of ${totalPages}, ${totalRecords} total)`;
            
            // Show session info in result-stats
            const sessionInfo = document.getElementById('sessionInfo');
            if (sessionInfo) {
                sessionInfo.textContent = `Session: ${session.sessionId.slice(-8)}`;
                sessionInfo.style.display = 'inline';
            }
        } else {
            recordCount.textContent = `${data.length} records`;
            
            // Hide session info for regular mode
            const sessionInfo = document.getElementById('sessionInfo');
            if (sessionInfo) {
                sessionInfo.style.display = 'none';
            }
        }
        
        const jsonSize = new Blob([JSON.stringify(data)]).size;
        dataSize.textContent = formatBytes(jsonSize);
        
        // Handle pagination controls
        const paginationControls = document.getElementById('paginationControls');
        if (session && session.pagination) {
            updatePaginationControls(session);
            paginationControls.style.display = 'block';
        } else {
            paginationControls.style.display = 'none';
        }
        
        // Show result section and action buttons
        resultSection.style.display = 'block';
        copyBtn.style.display = 'flex';
        downloadBtn.style.display = 'flex';
    }

    // Update pagination controls
    function updatePaginationControls(session) {
        const { pagination, sessionId } = session;
        const { currentPage, totalPages, totalRecords, hasNextPage, hasPreviousPage, nextUrl, prevUrl } = pagination;

        // Update page indicator
        const pageIndicator = document.getElementById('pageIndicator');
        pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;

        // Update button states
        const firstPageBtn = document.getElementById('firstPageBtn');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const lastPageBtn = document.getElementById('lastPageBtn');

        firstPageBtn.disabled = !hasPreviousPage;
        prevPageBtn.disabled = !hasPreviousPage;
        nextPageBtn.disabled = !hasNextPage;
        lastPageBtn.disabled = !hasNextPage;

        // Remove existing event listeners and add new ones
        const newFirstPageBtn = firstPageBtn.cloneNode(true);
        const newPrevPageBtn = prevPageBtn.cloneNode(true);
        const newNextPageBtn = nextPageBtn.cloneNode(true);
        const newLastPageBtn = lastPageBtn.cloneNode(true);

        firstPageBtn.parentNode.replaceChild(newFirstPageBtn, firstPageBtn);
        prevPageBtn.parentNode.replaceChild(newPrevPageBtn, prevPageBtn);
        nextPageBtn.parentNode.replaceChild(newNextPageBtn, nextPageBtn);
        lastPageBtn.parentNode.replaceChild(newLastPageBtn, lastPageBtn);

        // Add event listeners
        newFirstPageBtn.addEventListener('click', () => loadPage(1));
        newPrevPageBtn.addEventListener('click', () => loadPage(currentPage - 1));
        newNextPageBtn.addEventListener('click', () => loadPage(currentPage + 1));
        newLastPageBtn.addEventListener('click', () => loadPage(totalPages));
    }

    // Show loading state
    function showLoading(showProgress = false) {
        hideAllSections();
        loadingSection.style.display = 'block';
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="btn-icon">⏳</span>Generating...';
        
        const progressContainer = document.getElementById('progressContainer');
        const loadingText = document.getElementById('loadingText');
        
        if (showProgress) {
            progressContainer.style.display = 'block';
            loadingText.textContent = 'Generating large dataset...';
            resetProgress();
        } else {
            progressContainer.style.display = 'none';
            loadingText.textContent = 'Generating your realistic data...';
        }
    }

    function updateProgress(percentage, estimate = '') {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressEstimate = document.getElementById('progressEstimate');
        
        if (progressFill && progressText) {
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${Math.round(percentage)}%`;
            if (progressEstimate && estimate) {
                progressEstimate.textContent = estimate;
            }
        }
    }

    function resetProgress() {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressEstimate = document.getElementById('progressEstimate');
        
        if (progressFill && progressText) {
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            if (progressEstimate) {
                progressEstimate.textContent = '';
            }
        }
    }

    // Enhanced validation function
    function validateFormData(formData, enablePagination, numRecordsValue, limits) {
        // Check for negative values
        if (formData.numFields <= 0 || formData.numObjects < 0 || formData.numNesting < 0 || formData.nestedFields < 0) {
            return { isValid: false, error: 'All values must be non-negative (fields must be at least 1)' };
        }

        // Check for decimal values where integers are expected
        if (!Number.isInteger(formData.numFields) || !Number.isInteger(formData.numObjects) || 
            !Number.isInteger(formData.numNesting) || !Number.isInteger(formData.nestedFields) || 
            !Number.isInteger(numRecordsValue)) {
            return { isValid: false, error: 'All values must be whole numbers' };
        }

        // Logical validation
        if (formData.numObjects > 0 && formData.numNesting === 0) {
            return { isValid: false, error: 'Cannot have nested objects (> 0) with nesting depth of 0' };
        }

        if (formData.numNesting > 0 && formData.numObjects === 0) {
            return { isValid: false, error: 'Cannot have nesting depth (> 0) without any nested objects' };
        }

        if (formData.numObjects > 0 && formData.nestedFields === 0) {
            return { isValid: false, error: 'Nested objects need at least 1 field each' };
        }

        // Memory usage estimation
        const estimatedTotalFields = formData.numFields + (formData.numObjects * formData.nestedFields * Math.pow(2, formData.numNesting));
        const estimatedMemoryMB = (estimatedTotalFields * numRecordsValue * 50) / (1024 * 1024); // Rough estimate
        
        if (estimatedMemoryMB > 500) {
            return { isValid: false, error: `Estimated memory usage too high (~${Math.round(estimatedMemoryMB)}MB). Please reduce complexity or use pagination.` };
        }

        return { isValid: true };
    }

    // Performance warning function
    function checkPerformanceWarnings(formData, enablePagination, numRecordsValue) {
        const warnings = [];
        
        // High record count warning
        if (!enablePagination && numRecordsValue > 5000) {
            warnings.push(`• ${numRecordsValue.toLocaleString()} records is quite large. Consider using pagination.`);
        }

        // High field count warning
        if (formData.numFields > 100) {
            warnings.push(`• ${formData.numFields} fields per record may slow generation.`);
        }

        // Deep nesting warning
        if (formData.numNesting > 3) {
            warnings.push(`• Nesting depth of ${formData.numNesting} creates complex structures.`);
        }

        // Complex nested structure warning
        const totalNestedFields = formData.numObjects * formData.nestedFields * Math.pow(2, formData.numNesting);
        if (totalNestedFields > 50) {
            warnings.push(`• Complex nesting will create ~${totalNestedFields} nested fields per record.`);
        }

        // Uniform field length with large dataset
        if (formData.uniformFieldLength && numRecordsValue > 2000) {
            warnings.push(`• Fixed field lengths with ${numRecordsValue.toLocaleString()} records requires extra processing.`);
        }

        return warnings;
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
        
        // Hide pagination controls
        const paginationControls = document.getElementById('paginationControls');
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }
        
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