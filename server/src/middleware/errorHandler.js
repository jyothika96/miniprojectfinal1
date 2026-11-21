/**
 * Centralized Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
  console.error('[API Error]:', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Handle MySQL specific errors
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'A duplicate record already exists with those unique parameters.',
      error: err.message,
    });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({
      success: false,
      message: 'Referenced foreign record (disease, region, or facility) does not exist.',
      error: err.message,
    });
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({
      success: false,
      message: 'Cannot delete or alter this record because other records depend on it.',
      error: err.message,
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'An internal server error occurred',
    code: err.code || 'INTERNAL_ERROR',
  });
}

module.exports = errorHandler;
