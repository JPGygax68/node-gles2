// this is used to generate node based webgl bindings
var get = require('request').get;
var fs = require('fs');

get('http://www.khronos.org/registry/gles/api/2.0/gl2.h', function(err, res, headerString) {

  var cc = [
    '#include <node.h>',
    '#include <v8.h>',
    '#include "arch_wrapper.h"',
    '',
    'using namespace v8;',
    'using namespace node;',
    '',
    ''
  ],
  init = [
    'void init(Handle<Object> target) {',
  ],
  initPost = [
    '}',
    '',
    'NODE_MODULE(gles2, init)',
  ];


  // Methods
  init.push('');
  init.push('  // Methods')
  headerString.match(/GL_APICALL .+ GL_APIENTRY gl[^;]+/g).forEach(function(fn) {
      var parts = fn.replace(/[\(\),]/g, '').replace(/ *GL_APIENTRY/g, '').replace(/GL_APICALL /g, '').split(' ');
      var signature = {};

      signature.returnType = parts.shift();
      if ( signature.returnType === 'const') {
        console.log('here');
         signature.returnType += ' ' + parts.shift();
         console.log(signature.returnType, parts);
      }

      var fnName = signature.name = parts.shift();
      var upper = fnName[0].toUpperCase() + fnName.substring(1);
      signature.arguments = {};
      signature.list = [];

      while (parts.length) {
        var argType = parts.shift();
        if (argType === 'const' || argType === 'const*') {
          argType += ' ' + parts.shift();
        } else if (argType === '') {
          continue;
        } else if (parts.length === 0 && argType === 'void') {
          break;
        }

        var argName = parts.shift();
        if (argName === '') {
         continue
        } else if (argName === 'const*') {
          argType += ' ' + argName;
          argName = parts.shift();
        }

        if (!argName || !argType) {
          throw new Error(argName + ' : ' + argType + ' : ' + fn);
        }
        signature.arguments[argName] = argType;
        signature.list.push(argName);
      }


      cc.push('Handle<Value> ' + upper  + '(const Arguments& args) {');
      cc.push('  HandleScope scope;');
      cc.push('');

      // collect arguments
      signature.list.forEach(function(name, i) {

        var type = this.arguments[name];

        switch (type) {
          case 'GLenum':
          case 'GLint':
          case 'GLsizei':
          case 'GLbitfield':
            cc.push('  ' + type + ' ' + name + ' = args[' + i + ']->Int32Value();')
          break;

          case 'GLboolean':
            cc.push('  ' + type + ' ' + name + ' = (GLboolean)args[' + i + ']->Int32Value();')
          break;

          case 'GLuint':
          case 'GLsizeiptr':
          case 'GLintptr':
            cc.push('  ' + type + ' ' + name + ' = args[' + i + ']->Uint32Value();')
          break;

          case 'GLfloat':
          case 'GLclampf':
            cc.push('  ' + type + ' ' + name + ' = args[' + i + ']->NumberValue();')
          break;

          case 'const GLchar*':
            cc.push('  v8::String::Utf8Value string_' + name + '(args[' + i + ']);')
            cc.push('  ' + type + ' ' + name + ' = *string_' + name + ';');
          break;

          case 'const GLvoid*':
          case 'const GLfloat*':
            cc.push('');
            cc.push('  // buffer');
            cc.push('  Local<Object> obj_' + name + ' = args[0]->ToObject();');
            cc.push('  if (obj_' + name + '->GetIndexedPropertiesExternalArrayDataType() != kExternalFloatArray) {');
            cc.push('    ThrowException(Exception::TypeError(String::New("' + this.name + ' expects a Buffer for argument ' + i + '")));');
            cc.push('    return scope.Close(Undefined());');
            cc.push('  }');
            cc.push('  ' + type + ' '+ name + ' = static_cast<' + type + '>(obj_' + name + '->GetIndexedPropertiesExternalArrayData());');
            cc.push('');
          break;


          case 'const GLuint*':
          case 'const GLint*':
            cc.push('');
            cc.push('  // list of Gluints');
            cc.push('  Handle<Array> array_' + name + ' = Handle<Array>::Cast(args[' + i + ']);');
            cc.push('  int length_' + i + ' = array_' + name + '->Get(String::New("length"))->ToObject()->Uint32Value();');
            cc.push('  ' + type.replace('*', '').replace('const ', '') + ' ' + name + '[length_' + i + '];');
            cc.push('  for (int i=0; i<length_' + i + '; i++) {');
            cc.push('    ' + name + '[i] = array_' + name + '->Get(i)->ToObject()->Uint32Value();');
            cc.push('  }');
            cc.push('');
          break;

          case 'const GLchar* const*':
            cc.push('');
            cc.push('  // list of strings');
            cc.push('  Handle<Array> array_' + name + ' = Handle<Array>::Cast(args[' + i + ']);');
            cc.push('  int length_' + i + ' = array_' + name + '->Get(String::New("length"))->ToObject()->Uint32Value();');
            cc.push('  const GLchar *' + name + '[length_' + i + '];');
            cc.push('  for (int i=0; i<length_' + i + '; i++) {');

            cc.push('    v8::String::Utf8Value string_' + i + '(args[' + i + ']);')
            cc.push('    ' + name + '[i] = *string_' + i + ';');
            cc.push('  }');
            cc.push('');
          break;

        }

      }.bind(signature));

      cc.push('');

      switch (signature.returnType) {
        case 'void':
          // TODO: out args
          cc.push('  ' + signature.name + '(' + Object.keys(signature.arguments).join(', ') + ');');
          cc.push('  return scope.Close(Undefined());');
        break;

        case 'int':
        case 'GLint':
        case 'GLenum':
        case 'GLuint':
          cc.push('  ' + signature.returnType + ' ret = ' + signature.name + '(' + Object.keys(signature.arguments).join(', ') + ');');
          cc.push('  return scope.Close(Number::New(ret));');
        break;

        case 'GLboolean':
          cc.push('  ' + signature.returnType + ' ret = ' + signature.name + '(' + Object.keys(signature.arguments).join(', ') + ');');
          cc.push('  return scope.Close(Boolean::New(ret));');
        break;

        case 'const GLubyte*':
          cc.push('  ' + signature.returnType + ' ret = ' + signature.name + '(' + Object.keys(signature.arguments).join(', ') + ');');
          cc.push('  return scope.Close(String::New((const char *)ret));');
        break;
      }


      init.push('  SetMethod(target, "' + fnName + '", ' + upper + ');');

      cc.push('}');
      cc.push('');
  });


  // CONSTANTS
  init.push('');
  init.push('  // Constants')
  headerString.match(/#define (GL_[^ ]+).*/g).forEach(function(constant) {
    constant = constant.replace(/[ ]*\/\*.*\*\/[ ]*/, '');
    constant = constant.replace('#define ', '').replace(/(  *)/g,'", ');
    init.push('  DEFINE_CONSTANT(target, "' + constant + ');');
  });
  init.push('');

  var out = cc.join('\n') + init.join('\n') + initPost.join('\n') + '\n';

  fs.writeFile(__dirname + '/src/gles2.cc', out, function() {});
});
