var rivals_data, profiles_data, refid, profiles_data_filtered
$(document).ready(async function () {
  rivals_data = JSON.parse(document.getElementById("rivals-pass").innerText);
  profiles_data = JSON.parse(
    document.getElementById("profiles-pass").innerText
  );
  refid = document.getElementById("refid-pass").innerText
  profiles_data_filtered = profiles_data.filter(
    (p) =>
      p['__refid'] !== refid &&
      !rivals_data.filter(r => r.slot > 0).map(r => r.ddrCode).includes(p.ddrCode)
  );

  for (let ind = 0; ind < 10; ind++) {
    let riv
    if(ind < rivals_data.length) {
      riv = rivals_data[ind]
    }
    if(!riv) riv = {
      rivalCode: '-',
      dancerName: '-'
    } 
    else {
      const p = profiles_data.find(p => p.ddrCode === riv.rivalCode)
      riv['dancerName'] = p ? p.dancerName : 'NOT FOUND'
    }
    $("#rivalslist").append(
      $("<tr>")
        .append(
          $("<td style='vertical-align: middle;'>").append(
            $("<div class='field'>").append(
               riv.dancerName
            )
          )
        )
        .append($("<td style='vertical-align: middle;'>").append(riv.rivalCode))
        .append($("<td style='vertical-align: middle;'>").append($(`<a class="button is-danger jb-modal data-delete-button" value="${riv.rivalCode}" ${riv.rivalCode == '-' ? 'disabled' : ''}>`)
          .append($(`<span class="icon"><i class="mdi mdi-trash-can mdi-18px">`))
        ))
    );
  }

  for (let slot = 0; slot < 3; slot++) {
    $("#activerivals").append(
      $("<tr>").append(
        $("<td>").append(slot+1)
      )
      .append(
        $("<td>").append(
          getSlotRivals(slot + 1, rivals_data)
        )
      )
    );
  }

  // Populate datalist for autocomplete with other dancers on server
  const otherProfiles = profiles_data.filter(p => p && p['__refid'] !== refid && p.dancerName);
  $('#profiles-datalist').empty();
  for (const p of otherProfiles) {
    $('#profiles-datalist').append(
      $('<option>').attr('value', p.dancerName).text(`Code: ${p.ddrCode || ''}`)
    );
  }

  $("#addrival").click(async function () {
    const query = $("#rival-search").val().trim();
    if (!query) {
      alert("Please enter a Dancer Name or DDR Code.");
      return;
    }

    const queryLower = query.toLowerCase();
    const matched = profiles_data.find(p =>
      p && p['__refid'] !== refid && (
        (p.dancerName && p.dancerName.toLowerCase() === queryLower) ||
        (p.ddrCode && p.ddrCode.toString() === query)
      )
    );

    await emit("addRival", {
      ddrCode: matched ? matched.ddrCode : (parseInt(query) || 0),
      name: query,
      refid: refid,
    }).then(function (response) {
      alert(response.data.alert);
      if (response.data.success) {
        location.reload();
      }
    });
  });

  $("#rival-search").on("keypress", function (e) {
    if (e.which === 13) {
      $("#addrival").click();
    }
  });

  $(document).on("click", ".data-delete-button", async function() {
    const code = $(this).attr('value');
    if (!code || code === '-') return;
    if (!confirm("Are you sure you want to remove this rival?")) return;
    await emit("deleteRival", {
      ddrCode: parseInt(code),
      refid: refid,
    }).then(function (response) {
      alert(response.data.alert);
      location.reload();
    });
  });

  $("#rival1,#rival2,#rival3").change(async function () {
    const curSlot = parseInt(this.id.slice(5,6))
    const ddrCode = parseInt($(this).val())
    await emit("updateRivalSlot", {
      refid,
      slot: curSlot,
      ddrCode
    }).then(function (response) {
      for(let slot = 1; slot <= 3; slot++) {
        if(ddrCode !== 0 && slot !== curSlot) {
          if(ddrCode === parseInt($(`#rival${slot}`).val())) $(`#rival${slot}`).val(0)
        }
      }
    });
  })
});

function getSlotRivals(slot, rivals) {
  console.log('populating slot' + slot)
  let select = $(`<select id="rival${slot}">`)
  select.append(
    '<option value="0">Select rival</option>'
  )
  for(const riv of rivals) {
    const p = profiles_data.find(p => p.ddrCode === riv.rivalCode)
    if(!p) continue
    select.append(
      `<option value="${riv.rivalCode}" ${riv.slot === slot ? "selected" : ""}>${p.dancerName}</option>`
    )
  }
  return $(`<div id='rivalsel${slot}' class='field'>`).append(
    $("<div class='control select'>").append(
      select
    )
  )
  return select
}
