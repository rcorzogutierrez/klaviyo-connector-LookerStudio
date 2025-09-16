// Configuración del conector
var cc = DataStudioApp.createCommunityConnector();

// URL base de la API de Klaviyo
var API_BASE_URL = 'https://a.klaviyo.com/api';

// ============================================
// FUNCIONES DE AUTENTICACIÓN
// ============================================

function getAuthType() {
  return cc.newAuthTypeResponse()
    .setAuthType(cc.AuthType.KEY)
    .build();
}

function resetAuth() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty('dscc.klaviyo.apiKey');
}

function isAuthValid() {
  var apiKey = PropertiesService.getUserProperties().getProperty('dscc.klaviyo.apiKey');
  if (!apiKey) {
    return false;
  }
  
  var url = API_BASE_URL + "/campaigns?filter=equals(messages.channel,'email')";
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey.trim(),
      'Accept': 'application/json',
      'revision': '2024-10-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    return response.getResponseCode() === 200;
  } catch (e) {
    console.error('Auth validation error:', e.toString());
    return false;
  }
}

function setCredentials(request) {
  if (!request.key || request.key.trim() === '') {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  
  var apiKey = request.key.trim();
  
  if (!apiKey.startsWith('pk_')) {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  
  var url = API_BASE_URL + "/campaigns?filter=equals(messages.channel,'email')";
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey,
      'Accept': 'application/json',
      'revision': '2024-10-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      PropertiesService.getUserProperties().setProperty('dscc.klaviyo.apiKey', apiKey);
      return {
        errorCode: 'NONE'
      };
    } else {
      return {
        errorCode: 'INVALID_CREDENTIALS'
      };
    }
  } catch (e) {
    console.error('Error validating credentials:', e.toString());
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
}

// ============================================
// CONFIGURACIÓN Y ESQUEMA CON DIMENSIONES POR DEFECTO
// ============================================

function getConfig() {
  var config = cc.getConfig();
  
  config.newInfo()
    .setId('instructions')
    .setText('Conector para obtener datos de campañas de email de Klaviyo.\n\n' +
             'FECHAS: Por defecto carga los últimos 7 días. Para fechas específicas, escribe en formato: YYYY-MM-DD,YYYY-MM-DD (ej: 2025-09-01,2025-09-15)');
  
  // Campo de texto para override manual de fechas
  config.newTextInput()
    .setId('dateRange')
    .setName('Rango de fechas específico (opcional)')
    .setHelpText('Deja vacío para usar el rango de fechas de Looker Studio. Para fechas específicas: YYYY-MM-DD,YYYY-MM-DD')
    .setPlaceholder('2025-09-01,2025-09-15')
    .setAllowOverride(true);
  
  // Habilitar fechas por defecto 
  config.setDateRangeRequired(true);
  
  return config.build();
}

function getSchema(request) {
  var fields = cc.getFields();
  var types = cc.FieldType;
  
  // Dimensiones en orden original (sin configuraciones especiales)
  fields.newDimension()
    .setId('campaign_id')
    .setName('Campaign ID')
    .setType(types.TEXT);
  
  fields.newDimension()
    .setId('campaign_name')
    .setName('Campaign Name')
    .setType(types.TEXT);
  
  fields.newDimension()
    .setId('status')
    .setName('Status')
    .setType(types.TEXT);
  
  fields.newDimension()
    .setId('created_at')
    .setName('Created Date')
    .setType(types.YEAR_MONTH_DAY);
  
  fields.newDimension()
    .setId('updated_at')
    .setName('Updated Date')
    .setType(types.YEAR_MONTH_DAY);
  
  fields.newDimension()
    .setId('send_time')
    .setName('Send Time')
    .setType(types.YEAR_MONTH_DAY_HOUR);

  fields.newDimension()
    .setId('subject')
    .setName('Subject')
    .setType(types.TEXT);

  fields.newDimension()
    .setId('preview_text')
    .setName('Preview Text')
    .setType(types.TEXT);

  // Métrica simple
  fields.newMetric()
    .setId('campaign_count')
    .setName('Campaign Count')
    .setType(types.NUMBER);
  
  return {
    'schema': fields.build()
  };
}

// ============================================
// FUNCIONES AUXILIARES PARA FECHAS
// ============================================

function parseDateString(dateString) {
  if (!dateString) {
    return null;
  }
  
  try {
    // Manejar formato YYYY-MM-DD (que envía Looker Studio)
    if (dateString.length === 10 && dateString.indexOf('-') !== -1) {
      var parts = dateString.split('-');
      if (parts.length !== 3) {
        return null;
      }
      
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1; // Los meses en JS van de 0-11
      var day = parseInt(parts[2], 10);
      
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return null;
      }
      
      // *** USAR UTC PARA EVITAR PROBLEMAS DE TIMEZONE ***
      return new Date(Date.UTC(year, month, day));
    }
    
    // Manejar formato YYYYMMDD (formato original esperado)
    if (dateString.length === 8 && dateString.indexOf('-') === -1) {
      var year = parseInt(dateString.substring(0, 4), 10);
      var month = parseInt(dateString.substring(4, 6), 10) - 1; // Los meses en JS van de 0-11
      var day = parseInt(dateString.substring(6, 8), 10);
      
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return null;
      }
      
      // *** USAR UTC PARA EVITAR PROBLEMAS DE TIMEZONE ***
      return new Date(Date.UTC(year, month, day));
    }
    
    return null;
    
  } catch (e) {
    console.error('Error parsing date string:', e.toString());
    return null;
  }
}

function buildDateFilter(dateRange) {
  // Solo construir filtro si hay rango de fechas válido
  if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
    return null;
  }
  
  try {
    // Usar filtro muy básico - solo canal email, sin status por ahora
    var filter = 'equals(messages.channel,"email")';
    return filter;
    
  } catch (e) {
    console.error('Error building date filter:', e.toString());
    return null;
  }
}

// Función para filtrar solo campañas enviadas del lado del cliente
function filterSentCampaigns(campaigns, dateRange) {
  try {
    console.log('Starting client-side filtering for sent campaigns...');
    console.log('Total campaigns to analyze:', campaigns.length);
    
    // Primero analizar todos los status únicos para debugging
    var statusCounts = {};
    campaigns.forEach(function(campaign, index) {
      if (campaign.attributes && campaign.attributes.status) {
        var status = campaign.attributes.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
    });
    
    console.log('Status distribution:', statusCounts);
    
    // Filtrar por campañas que tienen send_time (indica que fueron enviadas)
    var campaignsWithSendTime = campaigns.filter(function(campaign, index) {
      if (!campaign.attributes) {
        return false;
      }
      
      // Buscar campañas que tengan send_time (independientemente del status)
      if (campaign.attributes.send_time) {
        return true;
      }
      
      return false;
    });
    
    console.log('Campaigns with send_time (actually sent):', campaignsWithSendTime.length);
    
    // Si no hay rango de fechas, retornar todas las campañas con send_time
    if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
      console.log('No date range provided, returning all campaigns with send_time');
      return campaignsWithSendTime;
    }
    
    // Aplicar filtro de fechas si se proporciona
    var startDate = parseDateString(dateRange.startDate);
    var endDate = parseDateString(dateRange.endDate);
    
    if (!startDate || !endDate) {
      console.log('Could not parse date range, returning all campaigns with send_time');
      return campaignsWithSendTime;
    }
    
    // *** CORREGIR: Asegurar que endDate incluya todo el día hasta las 23:59:59 UTC ***
    endDate.setUTCHours(23, 59, 59, 999);
    
    console.log('Applying date filter from', startDate.toISOString(), 'to', endDate.toISOString());
    
    var filteredCampaigns = campaignsWithSendTime.filter(function(campaign, index) {
      try {
        var sendTime = new Date(campaign.attributes.send_time);
        
        if (isNaN(sendTime.getTime())) {
          return false;
        }
        
        // *** COMPARAR SOLO LAS FECHAS (YYYY-MM-DD) SIN HORAS PARA EVITAR PROBLEMAS DE TIMEZONE ***
        var sendDateOnly = sendTime.getUTCFullYear() + '-' + 
                          String(sendTime.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                          String(sendTime.getUTCDate()).padStart(2, '0');
                          
        var startDateOnly = dateRange.startDate; // Ya está en formato YYYY-MM-DD
        var endDateOnly = dateRange.endDate;     // Ya está en formato YYYY-MM-DD
        
        var isInRange = sendDateOnly >= startDateOnly && sendDateOnly <= endDateOnly;
        
        if (index < 5) { // Log first 5 campaigns for debugging
          console.log('Campaign', index, ': send_time =', sendTime.toISOString(), 
                     'sendDateOnly =', sendDateOnly, 'in range:', isInRange, 
                     '(', startDateOnly, 'to', endDateOnly, ')');
        }
        
        return isInRange;
      } catch (e) {
        return false;
      }
    });
    
    console.log('Final filtered campaigns (sent + date range):', filteredCampaigns.length);
    return filteredCampaigns;
    
  } catch (e) {
    console.error('Error in filterSentCampaigns:', e.toString());
    return campaigns; // Return original campaigns in case of error
  }
}

// ============================================
// OBTENCIÓN DE DATOS - LÓGICA CORREGIDA PARA FECHAS
// ============================================

function getData(request) {
  var apiKey = PropertiesService.getUserProperties().getProperty('dscc.klaviyo.apiKey');
  
  if (!apiKey) {
    cc.newUserError()
      .setText('API Key no configurada. Por favor, vuelve a autenticarte.')
      .throwException();
  }
  
  console.log('NUEVA VERSION - getData called');
  console.log('request.dateRange:', request.dateRange);
  console.log('request.configParams:', request.configParams);
  console.log('request.fields:', request.fields); // *** AGREGAR ESTE LOG ***
  
  var dateRange = null;
  var dateSource = '';
  
  // 1. Priorizar campo manual si está completado
  if (request.configParams && request.configParams.dateRange && request.configParams.dateRange.trim() !== '') {
    var manualDates = request.configParams.dateRange.trim().split(',');
    if (manualDates.length === 2 && manualDates[0].trim() !== '' && manualDates[1].trim() !== '') {
      dateRange = {
        startDate: manualDates[0].trim(),
        endDate: manualDates[1].trim()
      };
      dateSource = 'manual override';
      console.log('Using MANUAL dates from text field:', dateRange);
    }
  }
  
  // 2. *** CORREGIDO: Usar fechas de Looker Studio si están disponibles ***
  if (!dateRange && request.dateRange && request.dateRange.startDate && request.dateRange.endDate) {
    dateRange = {
      startDate: request.dateRange.startDate,
      endDate: request.dateRange.endDate
    };
    dateSource = 'Looker Studio date range';
    console.log('Using LOOKER STUDIO dates:', dateRange);
  }
  
  // 3. Solo como último recurso, usar últimos 7 días automáticamente
  if (!dateRange) {
    var today = new Date();
    var sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    dateRange = {
      startDate: sevenDaysAgo.toISOString().split('T')[0], // YYYY-MM-DD
      endDate: today.toISOString().split('T')[0] // YYYY-MM-DD
    };
    dateSource = 'automatic last 7 days (fallback)';
    console.log('Using AUTOMATIC last 7 days as fallback:', dateRange);
  }
  
  if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
    console.log('No valid date range available - returning empty result');
    
    var emptySchema = [];
    request.fields.forEach(function(field) {
      emptySchema.push({
        name: field.name,
        dataType: field.dataType || 'STRING'
      });
    });
    return {
      schema: emptySchema,
      rows: []
    };
  }
  
  console.log('Date source:', dateSource);
  console.log('Final dateRange:', dateRange);
  console.log('Executing query for sent campaigns...');
  
  // Construir filtro - solo campañas enviadas en el rango de fechas
  var dateFilter = buildDateFilter(dateRange);
  
  if (!dateFilter) {
    console.log('Could not build date filter - returning empty result');
    var emptySchema = [];
    request.fields.forEach(function(field) {
      emptySchema.push({
        name: field.name,
        dataType: field.dataType || 'STRING'
      });
    });
    return {
      schema: emptySchema,
      rows: []
    };
  }
  
  // *** CONSTRUIR URL LIMPIA SIN CURSORES DE PAGINACIÓN ***
  var baseUrl = "https://a.klaviyo.com/api/campaigns";
  var queryParams = [
    "filter=" + encodeURIComponent(dateFilter),
    "fields[campaign]=name,status,created_at,updated_at,send_time",
    "fields[campaign-message]=definition.content.subject,definition.content.preview_text",
    "include=campaign-messages"
  ];
  
  var url = baseUrl + "?" + queryParams.join("&");
  
  console.log('Final URL:', url);
  
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey,
      'Accept': 'application/json',
      'revision': '2025-07-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var allCampaigns = [];
    var allIncluded = [];
    var currentUrl = url;
    var pageCount = 0;
    var maxPages = 10;

    while (currentUrl && pageCount < maxPages) {
      console.log('Fetching page ' + (pageCount + 1) + ': ' + currentUrl);
      
      try {
        var response = UrlFetchApp.fetch(currentUrl, options);
        var responseCode = response.getResponseCode();
        var responseText = response.getContentText();
        
        console.log('Response code: ' + responseCode);
        console.log('Response length: ' + responseText.length);
        
        if (responseCode !== 200) {
          console.error('API Error - Code: ' + responseCode);
          console.error('API Error - Response: ' + responseText);
          
          // Si es la primera página, es un error crítico
          if (pageCount === 0) {
            throw new Error('Failed to fetch first page: HTTP ' + responseCode);
          } else {
            // Si es una página posterior, logs el error y continúa con lo que tenemos
            console.log('Error fetching page ' + (pageCount + 1) + ', continuing with ' + allCampaigns.length + ' campaigns');
            break;
          }
        }
        
        // Verificar si la respuesta está vacía
        if (!responseText || responseText.trim() === '') {
          console.error('Empty response from API on page ' + (pageCount + 1));
          break;
        }
        
        // Verificar si la respuesta parece ser JSON válido
        if (!responseText.trim().startsWith('{') && !responseText.trim().startsWith('[')) {
          console.error('Response does not appear to be JSON: ' + responseText.substring(0, 200));
          break;
        }
        
        try {
          var json = JSON.parse(responseText);
          
          if (!json.data) {
            console.error('No data property in response on page ' + (pageCount + 1));
            break;
          }
          
          console.log('Page ' + (pageCount + 1) + ' returned ' + json.data.length + ' campaigns');
          
          allCampaigns = allCampaigns.concat(json.data);
          if (json.included) allIncluded = allIncluded.concat(json.included);
          
          // Manejo más robusto de la siguiente URL
          if (json.links && json.links.next) {
            var nextUrl = json.links.next;
            
            // Validar la URL antes de usarla
            if (isValidUrl(nextUrl)) {
              currentUrl = nextUrl;
              console.log('Next page URL validated: ' + currentUrl);
            } else {
              console.log('Invalid next page URL received, stopping pagination: ' + nextUrl);
              currentUrl = null;
            }
          } else {
            console.log('No more pages available');
            currentUrl = null;
          }
          
          console.log('Successfully processed page ' + (pageCount + 1) + ', total campaigns so far: ' + allCampaigns.length);
          
        } catch (parseError) {
          console.error('JSON Parse Error on page ' + (pageCount + 1) + ': ' + parseError.toString());
          break;
        }
        
      } catch (fetchError) {
        console.error('Network/Fetch Error on page ' + (pageCount + 1) + ': ' + fetchError.toString());
        
        // Si es la primera página, es un error crítico
        if (pageCount === 0) {
          throw fetchError; // Re-lanzar el error para que se maneje arriba
        } else {
          // Si es una página posterior, logs el error y continúa con lo que tenemos
          console.log('Network error fetching page ' + (pageCount + 1) + ', continuing with ' + allCampaigns.length + ' campaigns');
          break;
        }
      }
      
      pageCount++;
      
      // Pequeña pausa entre requests para evitar rate limiting
      if (currentUrl && pageCount < maxPages) {
        Utilities.sleep(100); // 100ms de pausa
      }
    }

    console.log('Total campaigns fetched from API: ' + allCampaigns.length);

    // Filtrado adicional del lado del cliente para asegurar que solo sean campañas enviadas
    var beforeClientFilter = allCampaigns.length;
    allCampaigns = filterSentCampaigns(allCampaigns, dateRange);
    console.log('Client-side filtering: ' + beforeClientFilter + ' -> ' + allCampaigns.length + ' campaigns');

    console.log('Total sent campaigns after filtering: ' + allCampaigns.length);

    if (allCampaigns.length === 0) {
      var emptySchema = [];
      request.fields.forEach(function(field) {
        emptySchema.push({
          name: field.name,
          dataType: field.dataType || 'STRING'
        });
      });
      return {
        schema: emptySchema,
        rows: []
      };
    }

    // *** ORDENAR POR SEND_TIME (MÁS NUEVAS PRIMERO) ***
    allCampaigns.sort(function(a, b) {
      var sendTimeA = a.attributes && a.attributes.send_time ? new Date(a.attributes.send_time) : new Date(0);
      var sendTimeB = b.attributes && b.attributes.send_time ? new Date(b.attributes.send_time) : new Date(0);
      return sendTimeB.getTime() - sendTimeA.getTime(); // Descendente (más nuevas primero)
    });

    var schema = [];
    request.fields.forEach(function(field) {
      // Mantener solo los tipos de datos básicos que sabemos que funcionan
      var dataType = 'STRING'; // Default para la mayoría
      
      if (field.name === 'campaign_count') {
        dataType = 'NUMBER';
      }
      // Los campos de fecha los dejamos como STRING para evitar problemas
      
      schema.push({
        name: field.name,
        dataType: dataType
      });
    });
    
    console.log('Schema being returned:', schema); // *** AGREGAR ESTE LOG ***
    
    var rows = [];
    
    allCampaigns.forEach(function(campaign, index) {
      try {
        var values = [];
        
        var message = null;
        if (campaign.relationships && campaign.relationships['campaign-messages'] && 
            campaign.relationships['campaign-messages'].data && allIncluded.length > 0) {
          var messageId = campaign.relationships['campaign-messages'].data[0].id;
          message = allIncluded.find(function(item) {
            return item.id === messageId && item.type === 'campaign-message';
          });
        }
        
        request.fields.forEach(function(requestedField) {
          var value = '';
          
          try {
            switch (requestedField.name) {
              case 'campaign_id':
                value = campaign.id || '';
                break;
                
              case 'campaign_name':
                value = (campaign.attributes && campaign.attributes.name) ? 
                        String(campaign.attributes.name).replace(/"/g, '\\"') : '';
                break;
                
              case 'status':
                value = (campaign.attributes && campaign.attributes.status) ? 
                        String(campaign.attributes.status) : '';
                break;
                
              case 'created_at':
                if (campaign.attributes && campaign.attributes.created_at) {
                  try {
                    var date = new Date(campaign.attributes.created_at);
                    value = Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
                  } catch(e) {
                    value = '';
                  }
                } else {
                  value = '';
                }
                break;
                
              case 'updated_at':
                if (campaign.attributes && campaign.attributes.updated_at) {
                  try {
                    var date = new Date(campaign.attributes.updated_at);
                    value = Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
                  } catch(e) {
                    value = '';
                  }
                } else {
                  value = '';
                }
                break;
                
              case 'send_time':
                if (campaign.attributes && campaign.attributes.send_time) {
                  try {
                    var date = new Date(campaign.attributes.send_time);
                    value = Utilities.formatDate(date, 'GMT', 'yyyyMMddHH');
                  } catch(e) {
                    value = '';
                  }
                } else {
                  value = '';
                }
                break;
                
              case 'subject':
                if (message && message.attributes && message.attributes.definition && 
                    message.attributes.definition.content && message.attributes.definition.content.subject) {
                  value = String(message.attributes.definition.content.subject).replace(/"/g, '\\"');
                } else {
                  value = '';
                }
                break;
                
              case 'preview_text':
                if (message && message.attributes && message.attributes.definition && 
                    message.attributes.definition.content && message.attributes.definition.content.preview_text) {
                  value = String(message.attributes.definition.content.preview_text).replace(/"/g, '\\"');
                } else {
                  value = '';
                }
                break;

              case 'campaign_count':
                value = 1; // *** ASEGURAR QUE SEA NÚMERO, NO STRING ***
                break;
                
              default:
                value = '';
                break;
            }
          } catch (fieldError) {
            console.error('Error processing field ' + requestedField.name + ' for campaign ' + index + ': ' + fieldError.toString());
            value = requestedField.name === 'campaign_count' ? 1 : ''; // *** MANTENER NÚMERO PARA CAMPAIGN_COUNT INCLUSO EN ERRORES ***
          }
          
          values.push(value);
        });
        
        rows.push({
          values: values
        });
        
      } catch (campaignError) {
        console.error('Error processing campaign ' + index + ': ' + campaignError.toString());
        // Continuar con la siguiente campaña
      }
    });
    
    console.log('Successfully processed ' + rows.length + ' campaigns into rows');
    
    var result = {
      schema: schema,
      rows: rows
    };
    
    console.log('Final result - schema length:', result.schema.length, 'rows length:', result.rows.length); // *** AGREGAR ESTE LOG ***
    console.log('First row sample:', result.rows[0]); // *** AGREGAR ESTE LOG ***
    
    return result;
    
  } catch (e) {
    console.error('getData error: ' + e.toString());
    console.error('Error stack: ' + e.stack);
    
    // Retornar schema vacío en caso de error
    var errorSchema = [];
    request.fields.forEach(function(field) {
      errorSchema.push({
        name: field.name,
        dataType: field.dataType || 'STRING'
      });
    });
    
    return {
      schema: errorSchema,
      rows: []
    };
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function isValidUrl(urlString) {
  try {
    if (!urlString || urlString.trim() === '') {
      return false;
    }
    
    // Verificar que sea una URL válida de Klaviyo
    if (!urlString.startsWith('https://a.klaviyo.com/api/')) {
      console.log('Invalid URL domain: ' + urlString);
      return false;
    }
    
    // Verificar que no tenga caracteres problemáticos
    if (urlString.includes(' ') || urlString.includes('\n') || urlString.includes('\r')) {
      console.log('URL contains invalid characters: ' + urlString);
      return false;
    }
    
    return true;
  } catch (e) {
    console.log('Error validating URL: ' + e.toString());
    return false;
  }
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
  } catch (e) {
    console.error('Error formatting date:', e.toString());
    return '';
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  try {
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, 'GMT', 'yyyyMMddHH');
  } catch (e) {
    console.error('Error formatting datetime:', e.toString());
    return '';
  }
}

// ============================================
// FUNCIÓN REQUERIDA POR LOOKER STUDIO
// ============================================

function isAdminUser() {
  return false;
}
