module.exports = function (io) {
  // Store connected students by socket id
  const students = {};

  io.on('connection', (socket) => {
    // 1. Student registers their camera session
    socket.on('register-student', (data) => {
      students[socket.id] = {
        socketId: socket.id,
        testId: data.testId,
        rollNo: data.rollNo,
        name: data.name
      };
      
      // Join a room for this test so the admin can find them easily
      socket.join(`test_${data.testId}`);
      
      // Notify admins watching this test that a new student joined
      io.to(`admin_test_${data.testId}`).emit('student-registered', students[socket.id]);
    });

    // 2. Admin starts watching a specific test
    socket.on('admin-watch', (testId, callback) => {
      socket.join(`admin_test_${testId}`);
      
      // Find all currently active students in this test
      const activeStudents = Object.values(students).filter(s => s.testId === testId);
      
      if (typeof callback === 'function') {
        callback(activeStudents);
      }
    });

    // 3. WebRTC Negotiation - Admin requests an offer from a student
    socket.on('request-offer', (data) => {
      // Admin -> Student
      io.to(data.studentSocketId).emit('request-offer', {
        adminSocketId: socket.id,
      });
    });

    // 4. WebRTC Negotiation - Student sends offer to Admin
    socket.on('webrtc-offer', (data) => {
      // Student -> Admin
      io.to(data.adminSocketId).emit('webrtc-offer', {
        studentSocketId: socket.id,
        offer: data.offer,
      });
    });

    // 5. WebRTC Negotiation - Admin sends answer to Student
    socket.on('webrtc-answer', (data) => {
      // Admin -> Student
      io.to(data.studentSocketId).emit('webrtc-answer', {
        adminSocketId: socket.id,
        answer: data.answer,
      });
    });

    // 6. WebRTC Negotiation - ICE Candidate exchange
    socket.on('ice-candidate', (data) => {
      // Either direction
      io.to(data.targetSocketId).emit('ice-candidate', {
        sourceSocketId: socket.id,
        candidate: data.candidate,
      });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      const student = students[socket.id];
      if (student) {
        // Notify admins that this student left
        io.to(`admin_test_${student.testId}`).emit('student-disconnected', socket.id);
        delete students[socket.id];
      }
    });
  });
};
